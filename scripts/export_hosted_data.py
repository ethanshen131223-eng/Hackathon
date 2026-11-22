"""Export cached, attributed source data for the static MarineGUARDer website.

Run from the repository root with .venv-map/Scripts/python.exe
scripts/export_hosted_data.py. This command never downloads photos or source
observations. Refresh those inputs separately before making a newer snapshot.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from PIL import Image

from ocean_gradient import GradientSurface
from ocean_grid import DEFAULT_COASTLINE, DEFAULT_OBSERVATIONS, LandMask, OceanGrid
from practice_cases import CATALOG, FmlCases

SNAPSHOT_ZOOM = 13
SNAPSHOT_NOTE = (
    "Precomputed snapshot exported from published historical observations; not a "
    "live feed or complete pollution coverage. Tile geometry represents supported "
    "base-cell water. Smooth colors are bounded visual interpolation, not measured coverage."
)


def json_bytes(document):
    return json.dumps(document, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")


def write_json(path, document):
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json_bytes(document)
    path.write_bytes(content)
    return len(content)


def export_cases(catalog_path, photo_cache, output, exported_at):
    provider = FmlCases(json.loads(catalog_path.read_text(encoding="utf-8")))
    full_catalog_size = len(provider.pool)
    names = [name for name in provider.pool if (photo_cache / (Path(name).stem + ".jpg")).is_file()]
    if not names:
        raise ValueError("No cached playable FML photos are available; no photo download will be attempted")
    # Restrict the existing case builder to the cached pool. Its annotations and
    # target construction remain identical to the local API's published boxes.
    provider.pool = names
    cases = []
    photos = []
    destination = output / "photos"
    destination.mkdir(parents=True, exist_ok=True)
    for name in names:
        metadata = provider.images[name]
        photo_path = photo_cache / (Path(name).stem + ".jpg")
        with Image.open(photo_path) as photo:
            if photo.size != (metadata["width"], metadata["height"]):
                raise ValueError(f"Cached photo dimensions disagree with source annotations: {name}")
            photo.verify()
        other_ids = [provider.case_id(other) for other in names if other != name]
        case = provider.choose(difficulty="hosted", exclude=other_ids)
        if case["source"]["imageFile"] != name:
            raise ValueError(f"Case builder did not return the requested cached photo: {name}")
        for target in case["targets"]:
            x, y, width, height = target["bbox"]
            if not all(math.isfinite(value) for value in (x, y, width, height)) or not (
                x >= 0 and y >= 0 and width > 0 and height > 0 and x + width <= 1.000001 and y + height <= 1.000001
            ):
                raise ValueError(f"Source annotation falls outside the image: {name}")
        filename = photo_path.name
        content = photo_path.read_bytes()
        digest = hashlib.sha256(content).hexdigest()
        shutil.copyfile(photo_path, destination / filename)
        target_count = len(case["targets"])
        case["difficulty"] = "Beginner" if target_count <= 3 else "Explorer" if target_count <= 6 else "Challenge"
        case["sceneUrl"] = "/hosted/photos/" + filename
        case["source"].update({
            "poolSize": len(names), "drawPoolSize": len(names),
            "fullCatalogSize": full_catalog_size, "bundledPhotoCount": len(names),
            "imageSha256": digest, "exportedAt": exported_at, "precomputedSnapshot": True,
            "hostingNote": "Only these cached photos are bundled with the hosted site; the full catalog is not hosted.",
        })
        cases.append(case)
        photos.append({"imageFile": name, "url": case["sceneUrl"], "bytes": len(content), "sha256": digest})
    source = {key: value for key, value in cases[0]["source"].items()
              if key not in ("imageFile", "imageId", "annotationFile", "imageSha256", "capturedAt")}
    document = {"exportedAt": exported_at, "precomputedSnapshot": True, "source": source, "cases": cases, "photos": photos}
    size = write_json(output / "cases.json", document)
    return {"caseCount": len(cases), "fullCatalogSize": full_catalog_size,
            "caseJsonBytes": size, "photoBytes": sum(photo["bytes"] for photo in photos)}


def export_pollution(observations_path, coastline_path, output, exported_at, area_limit=None, max_snapshot_mb=20):
    content = observations_path.read_bytes()
    document = json.loads(content)
    if not isinstance(document.get("observations"), list) or not isinstance(document.get("source"), dict):
        raise ValueError("Pollution input requires a source object and observations array")
    grid = OceanGrid(document["observations"], LandMask.from_file(coastline_path), source=document["source"], max_features=10000)
    areas = grid.areas(limit=area_limit)
    source = {**grid.source, "precomputedSnapshot": True, "exportedAt": exported_at,
              "snapshotNote": SNAPSHOT_NOTE, "observationFileSha256": hashlib.sha256(content).hexdigest()}
    areas_document = {**areas, "source": source, "precomputedSnapshot": True, "exportedAt": exported_at}
    surface = GradientSurface(grid.selected, grid.land)
    snapshots = []
    for index, area in enumerate(areas["areas"], 1):
        west, south, east, north = area["bounds"]
        tiles = grid.tiles(west, south, east, north, zoom=SNAPSHOT_ZOOM)
        tiles["source"] = source
        tiles["metadata"].update({"precomputedSnapshot": True, "exportedAt": exported_at,
                                  "snapshotZoom": SNAPSHOT_ZOOM, "snapshotNote": SNAPSHOT_NOTE})
        span = (east - west) % 360 or 360
        # Approximately 1 km raster pixels, bounded to keep exports practical.
        width = max(128, min(900, math.ceil(span * 111.195 * max(.05, math.cos(math.radians((south+north)/2))))))
        height = max(128, min(768, math.ceil((north-south)*111.195)))
        gradient = surface.render(west, south, east, north, width=width, height=height)
        gradient.update({"precomputedSnapshot": True, "exportedAt": exported_at, "snapshotNote": SNAPSHOT_NOTE})
        snapshots.append({"areaId": area["id"], "bounds": area["bounds"], "tiles": tiles, "gradient": gradient})
        print(f"Prepared pollution snapshot {index}/{len(areas['areas'])}: {len(tiles['features'])} tiles", flush=True)
    selected_ids = {str(observation["id"]) for observation in grid.selected if observation.get("id") is not None}
    represented_ids = {identifier for snapshot in snapshots for feature in snapshot["tiles"]["features"]
                       for identifier in feature["properties"]["observationIds"]}
    coverage = {"sourceObservationCount": len(document["observations"]), "acceptedObservationCount": len(grid.accepted),
                "selectedObservationCount": len(grid.selected), "representedObservationCount": len(selected_ids & represented_ids),
                "uncoveredObservationIds": sorted(selected_ids - represented_ids), "rejectedObservationCount": grid.rejected_count,
                "areaCount": len(snapshots), "totalAreaCount": areas["metadata"]["totalAreaCount"],
                "sourceRegions": sorted({str(observation.get("region", "Not supplied")) for observation in grid.selected})}
    # One coarse field at world scale avoids hundreds of simultaneous bitmap
    # layers. Regional views retain the finer source-supported fields above.
    overview = surface.render(-180, -85.0511, 180, 85.0511, width=1536, height=768)
    overview.update({"precomputedSnapshot": True, "exportedAt": exported_at, "snapshotNote": SNAPSHOT_NOTE})
    snapshots_document = {"source": source, "areas": areas["areas"], "snapshots": snapshots, "coverage": coverage,
                          "overviewGradient": overview, "resolutionKm2": 1,
                          "precomputedSnapshot": True, "exportedAt": exported_at, "snapshotZoom": SNAPSHOT_ZOOM}
    areas_document.update({"coverage": coverage, "snapshotZoom": SNAPSHOT_ZOOM, "resolutionKm2": 1})
    encoded = json_bytes(snapshots_document)
    if len(encoded) > max_snapshot_mb * 1024 * 1024:
        raise ValueError(f"Pollution snapshots exceed the {max_snapshot_mb} MiB budget ({len(encoded)} bytes)")
    area_size = write_json(output / "pollution-areas.json", areas_document)
    (output / "pollution-snapshots.json").write_bytes(encoded)
    return {"areaCount": len(snapshots), "pollutionAreaJsonBytes": area_size,
            "pollutionSnapshotJsonBytes": len(encoded), "snapshotZoom": SNAPSHOT_ZOOM,
            "acceptedObservationCount": len(grid.accepted), "selectedObservationCount": len(grid.selected),
            "rejectedObservationCount": grid.rejected_count}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "web/public/hosted")
    parser.add_argument("--catalog", type=Path, default=CATALOG)
    parser.add_argument("--photo-cache", type=Path, default=ROOT / "data_sources/fml-photos")
    parser.add_argument("--observations", type=Path, default=DEFAULT_OBSERVATIONS)
    parser.add_argument("--coastline", type=Path, default=DEFAULT_COASTLINE)
    parser.add_argument("--area-limit", type=int, default=None)
    parser.add_argument("--max-snapshot-mb", type=float, default=20)
    parser.add_argument("--exported-at", help="Fixed ISO timestamp for reproducible snapshot metadata")
    parser.add_argument("--pollution-only", action="store_true", help="Refresh ocean snapshots without rewriting the cached game photos")
    args = parser.parse_args()
    if (args.area_limit is not None and args.area_limit < 1) or not math.isfinite(args.max_snapshot_mb) or args.max_snapshot_mb <= 0:
        parser.error("area-limit must be positive when supplied and max-snapshot-mb must be positive")
    exported_at = args.exported_at or datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    datetime.fromisoformat(exported_at.replace("Z", "+00:00"))
    args.output.mkdir(parents=True, exist_ok=True)
    cases = {} if args.pollution_only else export_cases(args.catalog, args.photo_cache, args.output, exported_at)
    if cases:
        print(f"Prepared {cases['caseCount']} cached FML cases", flush=True)
    pollution = export_pollution(args.observations, args.coastline, args.output, exported_at,
                                 args.area_limit, args.max_snapshot_mb)
    print(json.dumps({"output": str(args.output.resolve()), "exportedAt": exported_at, **cases, **pollution}), flush=True)


if __name__ == "__main__":
    main()
