import json

from scripts.export_hosted_data import export_pollution


def test_hosted_export_covers_all_source_regions_with_fine_supported_cells(tmp_path):
    observations = [dict(id=f"sample-{index}", longitude=-170 + index * 10,
                         latitude=10, densityPiecesKm2=120, observedAt=None,
                         kind="measured", materialScope="surface particles",
                         region=f"Ocean {index % 2}", sourceUrl="https://example.org/study",
                         uncertainty=None) for index in range(14)]
    input_path = tmp_path / "observations.json"
    input_path.write_text(json.dumps({"source": {"name": "Independent fixture"},
                                     "observations": observations}))
    coastline = tmp_path / "land.geojson"
    coastline.write_text(json.dumps({"type": "FeatureCollection", "features": []}))
    output = tmp_path / "hosted"
    result = export_pollution(input_path, coastline, output, "2026-11-21T00:00:00Z")
    snapshots = json.loads((output / "pollution-snapshots.json").read_text())
    assert result["areaCount"] == 14
    assert snapshots["snapshotZoom"] == 13
    assert snapshots["coverage"]["representedObservationCount"] == 14
    assert snapshots["coverage"]["uncoveredObservationIds"] == []
    features = [feature for snapshot in snapshots["snapshots"] for feature in snapshot["tiles"]["features"]]
    assert {identifier for feature in features for identifier in feature["properties"]["observationIds"]} == {
        f"sample-{index}" for index in range(14)}
    assert all(feature["properties"]["resolutionKm2"] == 1 for feature in features)
    assert all(feature["properties"]["uncertainty"] is None for feature in features)
    assert all(feature["properties"]["observationDates"] == [] for feature in features)
