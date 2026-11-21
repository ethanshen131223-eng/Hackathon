"""Fetch pinned public-domain Natural Earth land polygons and record provenance."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_land.geojson"
DESTINATION = ROOT / "data_sources" / "coastline" / "ne_10m_land.geojson"


def main():
    request = Request(URL, headers={"User-Agent": "MarineGUARDer/1.0 coastline research"})
    with urlopen(request, timeout=120) as response:
        payload = response.read()
    document = json.loads(payload)
    if document.get("type") != "FeatureCollection" or not document.get("features"):
        raise ValueError("Expected a nonempty land GeoJSON FeatureCollection")
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    temporary = DESTINATION.with_suffix(".download")
    temporary.write_bytes(payload)
    temporary.replace(DESTINATION)
    provenance = {
        "name": "Natural Earth 1:10m land",
        "repositoryTag": "v5.1.2",
        "url": URL,
        "documentationUrl": "https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/",
        "license": "Public domain",
        "licenseUrl": "https://www.naturalearthdata.com/about/terms-of-use/",
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "bytes": len(payload),
        "featureCount": len(document["features"]),
        "limitations": "Cartographic 1:10,000,000 coastline, not 10-metre spatial resolution. Small islands, tidal change and fine shorelines may be omitted; especially uncertain for 1 km² coastal cells. Natural Earth flags northern Russia and southern Chile coastline accuracy."
    }
    DESTINATION.with_name("provenance.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(payload):,} bytes, {len(document['features'])} features to {DESTINATION}")


if __name__ == "__main__":
    main()
