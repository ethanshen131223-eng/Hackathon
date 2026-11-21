"""Sparse, land-clipped equal-area estimates from compatible marine observations.

One point sample supports a *model estimate* in its fixed 1 km² base cell.
This is not a claim that a survey sampled the whole cell. Coarser zooms group
those cells without painting the intervening unsampled water. No-data is absent.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
import hashlib
import json
import math
from pathlib import Path
import geo_runtime  # Process-local PROJ database; never alter machine/PostGIS settings.
from pyproj import CRS, Transformer
from shapely import make_valid, prepare, segmentize, transform
from shapely.affinity import translate
from shapely.geometry import MultiPolygon, Point, Polygon, box, mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent
DEFAULT_COASTLINE = ROOT / "data_sources" / "coastline" / "ne_10m_land.geojson"
DEFAULT_OBSERVATIONS = ROOT / "data_sources" / "pollution_observations.json"
SUPPORT_METHOD = "Selected latest point observations averaged inside a fixed 1 km² equal-area base cell; cell water is a model estimate, not surveyed coverage."
SELECTION_METHOD = "Latest UTC calendar date per fixed 1 km² base cell and material scope; average ties on that date. Use undated observations only when that base cell has no dated observations."
COASTLINE_LIMITATIONS = "Natural Earth 1:10 million cartographic land polygons; small islands, fine shorelines and tides may be missing. Coastal 1 km² cells are especially uncertain."


def resolution_for_zoom(zoom: float) -> tuple[int, int]:
    """Return nominal equal-area square kilometres and side length in kilometres."""
    return (1, 1) if zoom >= 13 else (4, 2) if zoom >= 11 else (25, 5) if zoom >= 8 else (100, 10)


def classify_density(density: float) -> str:
    if density < 50:
        return "verylow"
    if density < 100:
        return "low"
    if density < 200:
        return "medium"
    if density < 600:
        return "high"
    return "severe"


def _polygons(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == "Polygon":
        return [geometry]
    if hasattr(geometry, "geoms"):
        return [part for child in geometry.geoms for part in _polygons(child)]
    return []


def _polygonal(geometry):
    parts = _polygons(geometry)
    return unary_union(parts) if parts else Polygon()


@dataclass(frozen=True)
class GridProjection:
    name: str
    epsg: int

    @property
    def forward(self):
        return _transformer(4326, self.epsg)

    @property
    def inverse(self):
        return _transformer(self.epsg, 4326)

    @property
    def latitude_band(self):
        return (-85.0, 85.0) if self.name == "global" else (85.0, 90.0) if self.name == "north" else (-90.0, -85.0)

    @property
    def domain(self):
        return _projection_domain(self.name)


PROJECTIONS = {name: GridProjection(name, code) for name, code in
               (("global", 6933), ("north", 6931), ("south", 6932))}


@lru_cache(maxsize=16)
def _transformer(source, destination):
    return Transformer.from_crs(source, destination, always_xy=True)


@lru_cache(maxsize=3)
def _projection_domain(name):
    projection = PROJECTIONS[name]
    if name == "global":
        w, s = projection.forward.transform(-180, -85)
        e, n = projection.forward.transform(180, 85)
        return box(w, s, e, n)
    x, y = projection.forward.transform(0, 85 if name == "north" else -85)
    return Point(0, 0).buffer(math.hypot(x, y), quad_segs=1440)


class LandMask:
    """Real polygon land, indexed independently in each equal-area projection."""
    def __init__(self, geometries, crs="EPSG:4326", provenance=None):
        self.crs = CRS.from_user_input(crs)
        self.parts = [part for geometry in geometries
                      for part in _polygons(make_valid(geometry))]
        prepare(self.parts)
        self.tree = STRtree(self.parts)
        self.provenance = provenance or {"name": "Supplied land polygons"}
        self._projected = {}

    @classmethod
    def from_file(cls, path=DEFAULT_COASTLINE):
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(f"Coastline missing: {path}. Run python scripts/fetch_coastline.py")
        document = json.loads(path.read_text(encoding="utf-8"))
        provenance_path = path.with_name("provenance.json")
        provenance = json.loads(provenance_path.read_text(encoding="utf-8")) if provenance_path.exists() else {"name": path.name}
        return cls([shape(feature["geometry"]) for feature in document["features"]], provenance=provenance)

    def is_land(self, longitude, latitude):
        x, y = _transformer(4326, self.crs.to_string()).transform(longitude, latitude)
        point = Point(x, y)
        return any(self.parts[int(index)].covers(point) for index in self.tree.query(point))

    def _index(self, projection):
        if projection.name not in self._projected:
            if self.crs == CRS.from_epsg(projection.epsg):
                projected = self.parts
            else:
                geographic_transform = _transformer(self.crs.to_string(), 4326)
                low, high = projection.latitude_band
                band = box(-180, low, 180, high)
                projected = []
                for part in self.parts:
                    geographic = part if self.crs == CRS.from_epsg(4326) else transform(part, geographic_transform.transform, interleaved=False)
                    geographic = geographic.intersection(band)
                    if not geographic.is_empty:
                        projected.extend(_polygons(make_valid(transform(geographic, projection.forward.transform, interleaved=False))))
            prepare(projected)
            self._projected[projection.name] = (projected, STRtree(projected))
        return self._projected[projection.name]

    def water(self, cell, projection):
        cell = cell.intersection(projection.domain)
        if cell.is_empty:
            return Polygon()
        parts, tree = self._index(projection)
        land = [parts[int(index)].intersection(cell) for index in tree.query(cell)
                if parts[int(index)].intersects(cell)]
        return _polygonal(cell.difference(unary_union(land))) if land else _polygonal(cell)


def _unwrap_ring(coordinates, reference=None):
    result = []
    for longitude, latitude in coordinates:
        previous = result[-1][0] if result else reference
        if previous is not None:
            longitude += 360 * round((previous - longitude) / 360)
        result.append((longitude, latitude))
    return result


def _geographic_geometry(projected, projection):
    """Densify polar edges and split antimeridian rings into legal GeoJSON."""
    result = []
    for polygon in _polygons(projected):
        geographic = transform(segmentize(polygon, 250), projection.inverse.transform, interleaved=False)
        shell = _unwrap_ring(geographic.exterior.coords)
        reference = shell[0][0]
        holes = [_unwrap_ring(ring.coords, reference) for ring in geographic.interiors]
        unwrapped = make_valid(Polygon(shell, holes))
        minimum, _, maximum, _ = unwrapped.bounds
        for wrap in range(math.floor((minimum + 180) / 360), math.floor((maximum + 180) / 360) + 1):
            piece = unwrapped.intersection(box(-180 + wrap * 360, -90, 180 + wrap * 360, 90))
            result.extend(_polygons(translate(piece, xoff=-wrap * 360)))
    if not result:
        return Polygon()
    return result[0] if len(result) == 1 else MultiPolygon(result)


def _finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _observation_date(observation):
    value = observation.get("observedAt")
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        return (parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed).date().isoformat()
    except ValueError:
        return None


def _viewport(west, south, east, north):
    values = [west, south, east, north]
    if not all(_finite_number(value) for value in values):
        raise ValueError("Viewport coordinates must be finite numbers")
    if not -90 <= south < north <= 90:
        raise ValueError("Expected -90 <= south < north <= 90")
    if abs(east - west) >= 360:
        return box(-180, south, 180, north)
    west = (west + 180) % 360 - 180
    east = (east + 180) % 360 - 180
    if west < east:
        return box(west, south, east, north)
    if west == east:
        raise ValueError("Viewport longitude span must be positive")
    return MultiPolygon([box(west, south, 180, north), box(-180, south, east, north)])


class OceanGrid:
    def __init__(self, observations, land, source=None, max_features=1200):
        self.land = land
        self.source = source or {}
        self.max_features = max(1, int(max_features))
        self.cells = defaultdict(list)
        self.accepted = []
        self.rejected_count = 0
        self._base_water = {}
        self._groups = {}
        self._bounds_cache = {}
        self._feature_cache = {}
        seen_ids = set()
        for original in observations:
            observation = dict(original)
            lon, lat, density = (observation.get(field) for field in
                                 ("longitude", "latitude", "densityPiecesKm2"))
            if (not all(_finite_number(value) for value in (lon, lat, density))
                    or density < 0 or not -90 <= lat <= 90 or not -180 <= lon <= 180
                    or observation.get("kind") not in ("measured", "model")
                    or not observation.get("materialScope") or not observation.get("sourceUrl")):
                self.rejected_count += 1
                continue
            identifier = str(observation.get("id", ""))
            if identifier and identifier in seen_ids:
                self.rejected_count += 1
                continue
            seen_ids.add(identifier)
            if land.is_land(lon, lat):
                self.rejected_count += 1
                continue
            projection = PROJECTIONS["north" if lat > 85 else "south" if lat < -85 else "global"]
            # +180 and -180 denote the same boundary; retain the +180 side's cell.
            x, y = projection.forward.transform(lon, lat)
            i, j = math.floor(x / 1000), math.floor(y / 1000)
            key = (projection.name, i, j, str(observation["materialScope"]))
            self.cells[key].append(observation)
            self.accepted.append(observation)
        self.selected_cells = {}
        self.selected = []
        for key, samples in self.cells.items():
            dates = [_observation_date(sample) for sample in samples]
            dated = [date for date in dates if date is not None]
            latest = max(dated) if dated else None
            selected = [sample for sample, date in zip(samples, dates) if date == latest]
            self.selected_cells[key] = selected
            self.selected.extend(selected)

    def _water(self, key):
        if key not in self._base_water:
            name, i, j, _ = key
            self._base_water[key] = self.land.water(box(i * 1000, j * 1000, (i + 1) * 1000, (j + 1) * 1000), PROJECTIONS[name])
        return self._base_water[key]

    def _grouped(self, factor):
        if factor not in self._groups:
            groups = defaultdict(list)
            for key in self.cells:
                name, i, j, scope = key
                groups[(name, i // factor, j // factor, scope)].append(key)
            self._groups[factor] = groups
        return self._groups[factor]

    def _tile_box(self, tile_key, factor):
        _, i, j, _ = tile_key
        side = factor * 1000
        return box(i * side, j * side, (i + 1) * side, (j + 1) * side)

    def _visible(self, tile_key, factor, viewport):
        cache_key = (factor, tile_key)
        if cache_key not in self._bounds_cache:
            projection = PROJECTIONS[tile_key[0]]
            self._bounds_cache[cache_key] = _geographic_geometry(self._tile_box(tile_key, factor).intersection(projection.domain), projection)
        return self._bounds_cache[cache_key].intersects(viewport)

    def _feature(self, tile_key, factor, base_keys):
        cache_key = (factor, tile_key)
        if cache_key in self._feature_cache:
            return self._feature_cache[cache_key]
        projection = PROJECTIONS[tile_key[0]]
        water = self.land.water(self._tile_box(tile_key, factor), projection)
        supported = []
        samples = []
        numerator = data_area = 0.0
        for key in base_keys:
            base_water = self._water(key)
            area = base_water.area
            if area <= 1e-6:
                continue
            observations = self.selected_cells[key]
            mean = sum(observation["densityPiecesKm2"] for observation in observations) / len(observations)
            numerator += mean * area
            data_area += area
            supported.append(base_water)
            samples.extend(observations)
        if data_area <= 1e-6 or water.area <= 1e-6:
            return None
        density = numerator / data_area
        source_kinds = sorted({str(observation.get("sourceKind", observation["kind"])) for observation in samples})
        source_urls = sorted({observation["sourceUrl"] for observation in samples})
        scope = tile_key[3]
        scope_id = hashlib.sha1(scope.encode()).hexdigest()[:8]
        identifier = f"{tile_key[0]}:{factor}km:{tile_key[1]}:{tile_key[2]}:{scope_id}"
        geometry = _geographic_geometry(unary_union(supported), projection)
        tile_center = self._tile_box(tile_key, factor).centroid
        center_lon, center_lat = projection.inverse.transform(tile_center.x, tile_center.y)
        feature = {"type": "Feature", "id": identifier, "geometry": mapping(geometry), "properties": {
            "id": identifier,
            "center": [(center_lon + 180) % 360 - 180, center_lat],
            "densityPiecesKm2": density,
            "classification": classify_density(density),
            "waterAreaKm2": water.area / 1e6,
            "dataWaterAreaKm2": data_area / 1e6,
            "coverageFraction": min(1.0, data_area / water.area),
            "observationDates": sorted({str(o["observedAt"]) for o in samples if o.get("observedAt")}),
            "observationCount": len(samples),
            "availableObservationCount": sum(len(self.cells[key]) for key in base_keys),
            "baseCellCount": len(supported),
            "kind": "model",
            "sourceKind": source_kinds[0] if len(source_kinds) == 1 else "mixed",
            "source": self.source.get("name", "Marine observations"),
            "materialScope": scope,
            "sourceUrl": source_urls[0] if len(source_urls) == 1 else source_urls,
            "uncertainty": None,
            "supportMethod": SUPPORT_METHOD,
            "selectionMethod": SELECTION_METHOD,
            "coverageMeaning": "Fraction of tile water assigned a base-cell model estimate; not the fraction physically sampled.",
            "projection": f"EPSG:{projection.epsg}",
            "resolutionKm2": factor * factor,
        }}
        self._feature_cache[cache_key] = feature
        return feature

    def tiles(self, west, south, east, north, zoom):
        viewport = _viewport(west, south, east, north)
        if not _finite_number(zoom) or not 0 <= zoom <= 30:
            raise ValueError("Zoom must be a finite number between 0 and 30")
        resolution, factor = resolution_for_zoom(zoom)
        groups = self._grouped(factor)
        all_longitudes = abs(east - west) >= 360 and south <= -90 and north >= 90
        visible = [key for key in sorted(groups) if all_longitudes or self._visible(key, factor, viewport)]
        features = []
        for key in visible[:self.max_features]:
            feature = self._feature(key, factor, groups[key])
            if feature is not None:
                features.append(feature)
        return {"type": "FeatureCollection", "features": features, "source": self.source,
                "metadata": {
                    "resolutionKm2": resolution, "cellSizeKm": factor,
                    "baseResolutionKm2": 1, "maxFeatures": self.max_features,
                    "availableFeatures": len(visible), "returnedFeatures": len(features),
                    "limited": len(visible) > self.max_features,
                    "geometryCoverage": "observed-base-cell-water",
                    "areaMethod": "WGS84 ellipsoidal equal-area projected metres (EPSG:6933; polar caps EPSG:6931/6932)",
                    "aggregation": "Latest-date mean per compatible 1 km² base cell, then clipped-water-area weighted mean of supported base cells; no missing-cell zero fill.",
                    "supportMethod": SUPPORT_METHOD,
                    "selectionMethod": SELECTION_METHOD,
                    "coastline": self.land.provenance,
                    "coastlineLimitations": COASTLINE_LIMITATIONS,
                    "acceptedObservationCount": len(self.accepted),
                    "selectedObservationCount": len(self.selected),
                    "rejectedObservationCount": self.rejected_count,
                }}

    def areas(self, limit=12):
        groups = defaultdict(list)
        for observation in self.selected:
            groups[(math.floor(observation["longitude"] / 5), math.floor(observation["latitude"] / 5))].append(observation)
        ranked = sorted(groups.items(), key=lambda item: (
            -int(any(o["densityPiecesKm2"] >= 200 for o in item[1])),
            -len(item[1]), -max(o["densityPiecesKm2"] for o in item[1]), item[0]))
        areas = []
        for (x, y), observations in ranked[:limit]:
            longitudes = [o["longitude"] for o in observations]
            latitudes = [o["latitude"] for o in observations]
            center = [sum(longitudes) / len(longitudes), sum(latitudes) / len(latitudes)]
            padding = 0.04
            bounds = [max(-180, min(longitudes) - padding), max(-90, min(latitudes) - padding),
                      min(180, max(longitudes) + padding), min(90, max(latitudes) + padding)]
            areas.append({"id": f"observations:{x}:{y}",
                          "name": f"Observed waters {abs(center[1]):.2f}°{'N' if center[1] >= 0 else 'S'}, {abs(center[0]):.2f}°{'E' if center[0] >= 0 else 'W'}",
                          "center": center, "bounds": bounds,
                          "dates": sorted({str(o["observedAt"]) for o in observations if o.get("observedAt")}),
                          "observationCount": len(observations),
                          "maxDensityPiecesKm2": max(o["densityPiecesKm2"] for o in observations)})
        return {"areas": areas, "source": self.source}
