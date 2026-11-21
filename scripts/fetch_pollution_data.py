"""Refresh compatible Oceaneye surface particle observations, using stdlib only.

The provider already reports particles/km2. No volume-to-area conversion or
spatial interpolation is performed. See docs/references/pollution-sources.md.
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import date, datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import urllib.parse
import urllib.request


PROVIDER_URL = "https://www.oceaneye.ch/en/cartographie/"
SERVICE_URL = "https://cartong.lizmap.com/websig/index.php/lizmap/service"
PROJECT = {"repository": "oceaneye", "project": "v_202412_projet_ocean_eye_BB"}
METHOD_URL = "https://www.oceaneye.ch/wp-content/uploads/methodology_data_oceaneye_final.pdf"
MODEL_URL = "https://www.oceaneye.ch/wp-content/uploads/interpolation_model_data_oceaneye.pdf"
WFS_PARAMETERS = {
    **PROJECT,
    "SERVICE": "WFS",
    "REQUEST": "GetFeature",
    "VERSION": "1.0.0",
    "OUTPUTFORMAT": "GeoJSON",
    "SRSNAME": "EPSG:4326",
    "TYPENAME": "point_c_num",
}
DOWNLOAD_URL = SERVICE_URL + "?" + urllib.parse.urlencode(WFS_PARAMETERS)
CONFIG_URL = SERVICE_URL + "/getProjectConfig?" + urllib.parse.urlencode(PROJECT)
MARINE_REGIONS = {
    "Med Sea", "North Atlantic Ocean", "South Atlantic Ocean",
    "North Pacific Ocean", "South Pacific Ocean", "Arctic Ocean",
    "Indian Ocean", "Southeast Asia", "Baltic Sea",
}
FRESHWATER_REGIONS = {"Lakes", "Rivers"}
MATERIAL_SCOPE = "Oceaneye surface micro- and mesoplastics >0.33 mm, combined size classes"
LIMITATIONS = [
    "Historical net-tow locations, not a live pollution feed or complete global coverage; unsampled water is unknown.",
    "The units describe source-reported surface micro- and mesoplastic particles, not all-size debris, mass, toxicity, or satellite-detected objects.",
    "Tows sample approximately the upper 0.15 m with 0.33 mm mesh; values are already reported in particles/km2 and are copied without volumetric conversion.",
    "From 2015 onward the published method estimates the 0.33-1 mm fraction from larger measured particles. These are conservatively labeled model (model-assisted net-tow observations), inferred from sample year because the export has no per-row model flag.",
    "No per-observation uncertainty is supplied by this point export. Null uncertainty means unavailable, not zero; no confidence or error bound is invented.",
    "The model-method report gives 28% average relative error for numerical concentration on its evaluation set; that is not a per-observation uncertainty or confidence interval.",
    "Provider region labels exclude lakes and rivers. Irregular volunteer sampling, particle identification, wind mixing, and method differences limit comparisons and extrapolation.",
    "The live map group is updated through 2025, while its capabilities abstract and project identifier retain older dates. Observation dates come from each source record.",
]


def normalize_features(features: list[dict], today: date) -> tuple[list[dict], dict]:
    """Keep marine point records in their original areal units; fail on ambiguity."""
    observations = []
    excluded = Counter(freshwater=0)
    identifiers = set()
    for feature in features:
        properties = feature["properties"]
        trawl = str(properties["trawl_num"]).strip()
        if not trawl or trawl in identifiers:
            raise ValueError(f"Empty or duplicate trawl identifier: {trawl!r}")
        identifiers.add(trawl)
        region = properties["region"]
        if region in FRESHWATER_REGIONS:
            excluded["freshwater"] += 1
            continue
        if region not in MARINE_REGIONS:
            raise ValueError(f"Unreviewed region label {region!r} for {trawl}")

        sampled = datetime.strptime(properties["date"], "%d/%m/%Y").date()
        if sampled > today or sampled.year != int(properties["year"]):
            raise ValueError(f"Future or inconsistent sample date for {trawl}")
        longitude = float(properties["longitude"])
        latitude = float(properties["latitude"])
        density = float(properties["c_tot_n_km2"])
        if not all(math.isfinite(value) for value in (longitude, latitude, density)):
            raise ValueError(f"Non-finite measurement for {trawl}")
        if not (-180 <= longitude <= 180 and -90 <= latitude <= 90 and density >= 0):
            raise ValueError(f"Invalid coordinate or density for {trawl}")
        geometry = feature["geometry"]
        if geometry["type"] != "Point" or any(
            abs(float(geometry["coordinates"][index]) - value) > 1e-7
            for index, value in enumerate((longitude, latitude))
        ):
            raise ValueError(f"Coordinate fields disagree with point geometry for {trawl}")
        feature_id = feature["id"]
        if not str(feature_id).startswith("point_c_num."):
            raise ValueError(f"Unexpected source feature identifier: {feature_id!r}")
        source_url = SERVICE_URL + "?" + urllib.parse.urlencode(
            {**WFS_PARAMETERS, "FEATUREID": feature_id}
        )
        observations.append({
            "id": "oceaneye:" + trawl,
            "longitude": longitude,
            "latitude": latitude,
            "densityPiecesKm2": density,
            "observedAt": sampled.isoformat(),
            "kind": "model" if sampled.year >= 2015 else "measured",
            "materialScope": MATERIAL_SCOPE,
            "sourceUrl": source_url,
            "uncertainty": None,
            "sourceFeatureId": feature_id,
            "region": region,
            "samplingMethod": "Manta net, 0.33 mm mesh, upper approximately 0.15 m",
            "kindDetail": (
                "Model-assisted net-tow observation; sub-mm fraction estimated under published provider method"
                if sampled.year >= 2015 else
                "Net-tow observation; particle fractions analyzed under published provider method"
            ),
            "kindBasis": "Inferred from sample year and provider method table; no per-row method flag supplied",
        })
    observations.sort(key=lambda observation: (observation["observedAt"], observation["id"]), reverse=True)
    if not observations:
        raise ValueError("Source did not contain any compatible marine observations")
    return observations, dict(excluded)


def read_remote(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "MarineGUARDer-scientific-data-refresh/1.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read()


def fetch_dataset() -> dict:
    retrieved = datetime.now(timezone.utc)
    config_bytes = read_remote(CONFIG_URL)
    config = json.loads(config_bytes)
    layer = config["layers"]["Number concentration [particles/km2]"]
    if layer["shortname"] != "point_c_num" or layer["geometryType"] != "point" or layer["crs"] != "EPSG:4326":
        raise ValueError("Provider layer/schema changed; review its units before refreshing")
    source_bytes = read_remote(DOWNLOAD_URL)
    source = json.loads(source_bytes)
    if source.get("type") != "FeatureCollection":
        raise ValueError("Expected a GeoJSON FeatureCollection from the provider")
    # Refuse to silently accept a newly paginated/truncated response.
    if source.get("links") or source.get("exceededTransferLimit"):
        raise ValueError("Provider returned a paginated response; review pagination before refreshing")
    observations, excluded = normalize_features(source["features"], retrieved.date())
    if len(observations) > 10000:
        raise ValueError("More than 10,000 records: define and document a sampling policy before refreshing")
    dates = [observation["observedAt"] for observation in observations]
    kinds = Counter(observation["kind"] for observation in observations)
    return {
        "source": {
            "name": "Oceaneye surface micro- and mesoplastic point observations",
            "url": PROVIDER_URL,
            "retrievedAt": retrieved.isoformat(timespec="seconds").replace("+00:00", "Z"),
            "downloadUrl": DOWNLOAD_URL,
            "configurationUrl": CONFIG_URL,
            "sourceSha256": hashlib.sha256(source_bytes).hexdigest(),
            "configurationSha256": hashlib.sha256(config_bytes).hexdigest(),
            "measurementField": "c_tot_n_km2",
            "originalUnits": "particles/km2",
            "outputUnits": "pieces/km2",
            "unitConversion": "None; particles and pieces both denote the source particle count",
            "methodUrl": METHOD_URL,
            "modelMethodUrl": MODEL_URL,
            "limitations": LIMITATIONS,
            "coverage": {
                "startDate": min(dates),
                "endDate": max(dates),
                "recordCount": len(observations),
                "sourcePointCount": len(source["features"]),
                "excludedFreshwaterCount": excluded["freshwater"],
                "measuredCount": kinds["measured"],
                "modelAssistedCount": kinds["model"],
                "regions": dict(sorted(Counter(observation["region"] for observation in observations).items())),
                "years": dict(sorted(Counter(observation["observedAt"][:4] for observation in observations).items())),
                "selection": "All compatible marine point records returned by the provider; no downsampling or spatial interpolation",
            },
        },
        "observations": observations,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "data_sources/pollution_observations.json")
    args = parser.parse_args()
    dataset = fetch_dataset()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # A failed network request or invalid response never replaces the valid snapshot.
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    try:
        temporary.write_text(json.dumps(dataset, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
        temporary.replace(args.output)
    finally:
        temporary.unlink(missing_ok=True)
    coverage = dataset["source"]["coverage"]
    print(f"Saved {coverage['recordCount']} marine observations ({coverage['startDate']} to {coverage['endDate']}) to {args.output}")
    print(f"Measured: {coverage['measuredCount']}; model-assisted: {coverage['modelAssistedCount']}; excluded freshwater: {coverage['excludedFreshwaterCount']}")


if __name__ == "__main__":
    main()
