"""Independent area fixtures and observable API contracts for the ocean grid."""
import json
import threading
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest
from pyproj import Geod, Transformer
from shapely import transform
from shapely.geometry import Polygon, box, shape

from ocean_grid import LandMask, OceanGrid, classify_density, resolution_for_zoom


def observation(identifier, x, y, density, **extra):
    # Literal metre positions in an independent equal-area fixture.
    lon, lat = Transformer.from_crs(6933, 4326, always_xy=True).transform(x, y)
    return dict(id=identifier, longitude=lon, latitude=lat,
                densityPiecesKm2=density, observedAt="2020-01-02",
                kind="measured", materialScope="floating plastic pieces",
                sourceUrl="https://example.org/science", uncertainty=None, **extra)


def projected_land(geometry):
    return LandMask([geometry], crs="EPSG:6933")


def make_grid(observations, land=None, max_features=1200):
    return OceanGrid(observations, land or projected_land(Polygon()),
                     source={"name": "Independent fixture", "url": "https://example.org/science"},
                     max_features=max_features)


WORLD = (-180, -90, 180, 90)


@pytest.mark.parametrize("zoom,area,side", [(14, 1, 1), (13, 1, 1), (12, 4, 2),
    (11, 4, 2), (10, 25, 5), (8, 25, 5), (7, 100, 10)])
def test_requested_zoom_selects_area_resolution(zoom, area, side):
    assert resolution_for_zoom(zoom) == (area, side)


@pytest.mark.parametrize("density,label", [(0,"verylow"), (49.99,"verylow"),
    (50,"low"), (99.99,"low"), (100,"medium"), (199.99,"medium"),
    (200,"high"), (599.99,"high"), (600,"severe")])
def test_absolute_threshold_boundaries(density, label):
    assert classify_density(density) == label


def test_clipped_water_weighted_mean_and_sparse_geometry_use_fixed_base_cells():
    # Base A is 1 km² of water at 100; B is 0.5 km² at 400.
    # The enclosing 2x2 tile has 3.5 km² water, of which 1.5 supports data.
    land = projected_land(box(1500, 0, 2000, 1000))
    grid = make_grid([observation("a", 500, 500, 100),
                      observation("b", 1250, 500, 400)], land)
    features = grid.tiles(*WORLD, zoom=11)["features"]
    assert len(features) == 1
    props = features[0]["properties"]
    assert props["densityPiecesKm2"] == pytest.approx(200, abs=1e-6)
    assert props["classification"] == "high"
    assert props["waterAreaKm2"] == pytest.approx(3.5, abs=1e-6)
    assert props["dataWaterAreaKm2"] == pytest.approx(1.5, abs=1e-6)
    assert props["coverageFraction"] == pytest.approx(3 / 7, abs=1e-6)
    # Unsampled half of the 2x2 tile must remain transparent.
    geom = transform(shape(features[0]["geometry"]),
                     Transformer.from_crs(4326, 6933, always_xy=True).transform,
                     interleaved=False)
    assert geom.area / 1e6 == pytest.approx(1.5, abs=1e-6)
    assert geom.intersection(box(0, 1000, 2000, 2000)).area < 1e-4
    assert props["kind"] == "model"
    assert props["sourceKind"] == "measured"
    assert props["uncertainty"] is None
    assert props["observationDates"] == ["2020-01-02"]
    assert props["center"] == pytest.approx([0.0103641678, 0.00783863], abs=1e-6)


def test_land_is_subtracted_and_island_holes_survive_geojson():
    grid = make_grid([observation("sea", 100, 100, 500)],
                     projected_land(box(400, 400, 600, 600)))
    result = grid.tiles(*WORLD, zoom=13)
    geom = shape(result["features"][0]["geometry"])
    assert geom.geom_type == "Polygon"
    assert len(geom.interiors) == 1
    props = result["features"][0]["properties"]
    assert props["waterAreaKm2"] == pytest.approx(0.96, abs=1e-6)
    assert props["dataWaterAreaKm2"] == pytest.approx(0.96, abs=1e-6)


def test_land_observations_and_missing_values_do_not_create_water_estimates():
    missing = observation("missing", 1500, 500, 5)
    missing["densityPiecesKm2"] = None
    grid = make_grid([observation("land", 500, 500, 500), missing],
                     projected_land(box(0, 0, 1000, 1000)))
    assert grid.tiles(*WORLD, zoom=13)["features"] == []
    assert grid.areas()["areas"] == []


def test_duplicate_samples_average_once_per_base_water_area():
    grid = make_grid([observation("a", 200, 500, 100),
                      observation("b", 500, 500, 300),
                      observation("c", 1500, 500, 400)])
    feature = grid.tiles(*WORLD, zoom=11)["features"][0]
    assert feature["properties"]["densityPiecesKm2"] == pytest.approx(300)
    assert feature["properties"]["dataWaterAreaKm2"] == pytest.approx(2)
    assert feature["properties"]["observationCount"] == 3


def test_latest_date_per_base_cell_averages_ties_before_water_area_aggregation():
    old = observation("old", 200, 500, 100)
    old["observedAt"] = "2019-02-01"
    newest = observation("new", 300, 500, 500)
    newest["observedAt"] = "2025-02-01"
    tie = observation("same-day", 500, 500, 300)
    tie["observedAt"] = "2025-02-01"
    historical_elsewhere = observation("historical", 1500, 500, 200)
    historical_elsewhere["observedAt"] = "2010-01-02"
    undated = observation("undated", 700, 500, 999)
    undated["observedAt"] = None
    grid = make_grid([old, newest, tie, historical_elsewhere, undated])
    result = grid.tiles(*WORLD, zoom=11)
    props = result["features"][0]["properties"]
    # Newest-date tie mean400 over1km²; other basecell200 over1km² =>300.
    assert props["densityPiecesKm2"] == pytest.approx(300)
    assert props["observationCount"] == 3
    assert props["availableObservationCount"] == 5
    assert props["observationDates"] == ["2010-01-02", "2025-02-01"]
    assert result["metadata"]["acceptedObservationCount"] == 5
    assert result["metadata"]["selectedObservationCount"] == 3
    assert "latest" in props["selectionMethod"].lower()
    assert "2019-02-01" not in grid.areas()["areas"][0]["dates"]


def test_undated_observations_are_used_only_when_base_cell_has_no_dated_sample():
    first = observation("one", 300, 500, 100)
    first["observedAt"] = None
    second = observation("two", 500, 500, 500)
    second["observedAt"] = ""
    result = make_grid([first, second]).tiles(*WORLD, zoom=13)
    props = result["features"][0]["properties"]
    assert props["densityPiecesKm2"] == pytest.approx(300)
    assert props["observationDates"] == []
    assert props["observationCount"] == 2
    assert "undated" in props["selectionMethod"].lower()


def test_world_queries_are_sparse_and_report_cap_without_inventing_observations():
    points = [observation(str(i), 500 + 20000 * i, 500, 200 + i) for i in range(5)]
    grid = make_grid(points, max_features=2)
    result = grid.tiles(*WORLD, zoom=0)
    assert len(result["features"]) == 2
    assert result["metadata"]["limited"] is True
    assert result["metadata"]["availableFeatures"] == 5
    assert result["metadata"]["resolutionKm2"] == 100
    assert result["metadata"]["cellSizeKm"] == 10
    assert result["metadata"]["maxFeatures"] == 2
    assert grid.tiles(-160, 0, -150, 5, zoom=13)["features"] == []


def test_observation_area_shortlist_prefers_real_high_density_regions():
    grid = make_grid([observation("low", 1000, 1000, 25),
                      observation("high", 1000000, 1000, 250)])
    areas = grid.areas()["areas"]
    assert areas[0]["observationCount"] == 1
    assert areas[0]["maxDensityPiecesKm2"] == 250
    assert len(areas[0]["bounds"]) == 4
    assert areas[0]["dates"] == ["2020-01-02"]


def test_all_observed_regions_are_available_without_a_twelve_area_cutoff():
    observations = []
    for index in range(14):
        sample = observation(str(index), 500, 500, 25 + index)
        sample.update(longitude=-170 + index * 10, latitude=10,
                      region="Independent ocean")
        observations.append(sample)
    grid = make_grid(observations)
    result = grid.areas()
    assert len(result["areas"]) == 14
    assert sum(area["observationCount"] for area in result["areas"]) == 14
    assert result["metadata"]["limited"] is False
    limited = grid.areas(limit=3)
    assert len(limited["areas"]) == 3
    assert limited["metadata"]["totalAreaCount"] == 14
    assert limited["metadata"]["limited"] is True


def test_area_bounds_include_bounded_visual_support_across_the_dateline():
    sample = observation("dateline", 500, 500, 120)
    sample.update(longitude=179.9, latitude=0)
    area = make_grid([sample]).areas()["areas"][0]
    west, south, east, north = area["bounds"]
    assert west < 179.3 and east < -179.4
    assert south < -.67 and north > .67


def test_source_point_ids_survive_latest_cell_selection_for_export_auditing():
    older = observation("older", 200, 500, 25)
    older["observedAt"] = "2010-01-01"
    selected = observation("selected", 200, 500, 50)
    feature = make_grid([older, selected]).tiles(*WORLD, zoom=13)["features"][0]
    assert feature["properties"]["observationIds"] == ["selected"]


def test_polar_observation_has_equal_area_and_wrapped_viewport_visibility():
    polar = dict(id="polar", longitude=179.999, latitude=89.9,
                 densityPiecesKm2=100, observedAt="2020-01-02", kind="measured",
                 materialScope="floating plastic pieces", sourceUrl="https://example.org/science",
                 uncertainty=None)
    grid = make_grid([polar])
    result = grid.tiles(170, 89, -170, 90, zoom=13)
    assert len(result["features"]) == 1
    props = result["features"][0]["properties"]
    assert props["waterAreaKm2"] == pytest.approx(1, abs=0.001)
    geom = shape(result["features"][0]["geometry"])
    assert geom.is_valid
    polygons = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
    assert all(p.bounds[2] - p.bounds[0] < 180 for p in polygons)


def test_northern_cell_area_matches_ellipsoid_instead_of_web_mercator():
    sample = observation("north", 500, 500, 25)
    sample.update(longitude=30.5, latitude=80.0)
    feature = make_grid([sample]).tiles(30, 79, 31, 81, zoom=13)["features"][0]
    geodesic_area, _ = Geod(ellps="WGS84").geometry_area_perimeter(shape(feature["geometry"]))
    assert abs(geodesic_area) / 1e6 == pytest.approx(1, abs=0.0001)


def test_material_cutoffs_are_not_blended_into_a_single_density():
    first = observation("micro", 500, 500, 20)
    second = observation("macro", 500, 500, 2000)
    second["materialScope"] = "macroplastic >25 mm"
    features = make_grid([first, second]).tiles(*WORLD, zoom=11)["features"]
    assert sorted(f["properties"]["densityPiecesKm2"] for f in features) == [20, 2000]


def test_real_downloaded_coastline_excludes_land_and_clips_coastal_water():
    land = LandMask.from_file()
    assert land.is_land(-122.4194, 37.7749)  # San Francisco city centre.
    assert not land.is_land(-123, 37.7)  # Open Pacific.
    sample = observation("pacific", 500, 500, 50)
    sample.update(longitude=-122.52, latitude=37.77)
    features = OceanGrid([sample], land).tiles(-123, 37, -122, 38, zoom=13)["features"]
    assert len(features) == 1
    assert 0 < features[0]["properties"]["waterAreaKm2"] < 1


def test_http_api_reloads_dataset_and_exposes_health_areas_tiles(tmp_path):
    from map_server import create_server

    path = tmp_path / "observations.json"
    path.write_text(json.dumps({"source": {"name": "Fixture"}, "observations": []}))
    server = create_server(port=0, observation_path=path, land=projected_land(Polygon()))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}"
    try:
        with urlopen(base + "/api/health") as response:
            assert json.load(response)["status"] == "ok"
        assert json.load(urlopen(base + "/api/tiles?west=-180&south=-90&east=180&north=90&zoom=13"))["features"] == []
        path.write_text(json.dumps({"source": {"name": "Fixture"},
            "observations": [observation("a", 500, 500, 200)]}))
        assert len(json.load(urlopen(base + "/api/areas"))["areas"]) == 1
        request = Request(base + "/api/tiles?west=-180&south=-90&east=180&north=90&zoom=13",
                          headers={"Origin": "http://127.0.0.1:5173"})
        with urlopen(request) as response:
            assert response.headers["Access-Control-Allow-Origin"] == "http://127.0.0.1:5173"
            assert len(json.load(response)["features"]) == 1
        with pytest.raises(HTTPError) as error:
            urlopen(base + "/api/tiles?west=nan&south=0&east=1&north=1&zoom=13")
        assert error.value.code == 400
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
