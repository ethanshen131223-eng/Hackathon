"""Snapshot NOAA NCEI field records without changing their reported units."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import math
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

SOURCE = "https://www.ncei.noaa.gov/products/microplastics"
QUERY = "https://services2.arcgis.com/C8EMgrsFcRFL6LrL/ArcGIS/rest/services/Marine_Microplastics_WGS84/FeatureServer/0/query"
OUT = Path(__file__).resolve().parents[1] / "web/public/hosted/noaa-microplastics.json"
FIELDS = ("OBJECTID,Medium,Microplastics_measurement,Unit,Sampling_Method,Date_m_d_yyyy,"
          "Location_Oceans,Beach_Location,Water_Sample_Depth__m_,Mesh_size__mm_,Short_Reference,NCEI_Accession_No")


def query(**params):
    with urlopen(f"{QUERY}?{urlencode({'f': 'json', **params})}", timeout=50) as response:
        data = json.load(response)
    if "error" in data:
        raise ValueError(data["error"])
    return data


def records(ids):
    data = query(where=f"OBJECTID BETWEEN {ids[0]} AND {ids[-1]}", outFields=FIELDS, outSR=4326)
    return data["features"]


def normalize(feature):
    item = feature["attributes"]
    geom = feature.get("geometry") or {}
    x, y = geom.get("x"), geom.get("y")
    if x is None or y is None or not (-180 <= x <= 180 and -90 <= y <= 90):
        return None
    date = item.get("Date_m_d_yyyy")
    day = datetime.fromtimestamp(date / 1000, timezone.utc).date().isoformat() if date is not None else None
    value = item.get("Microplastics_measurement")
    value = value if value is not None and math.isfinite(value) and value >= 0 else None
    return [round(x, 5), round(y, 5), item["OBJECTID"], item.get("Medium"), value,
            item.get("Unit"), day, item.get("Sampling_Method"), item.get("Location_Oceans"),
            item.get("Beach_Location"), item.get("Water_Sample_Depth__m_"), item.get("Mesh_size__mm_"),
            item.get("Short_Reference"), item.get("NCEI_Accession_No")]


def main():
    ids = sorted(set(query(where="1=1", returnIdsOnly="true")["objectIds"]))
    chunks = [ids[i:i + 500] for i in range(0, len(ids), 500)]
    with ThreadPoolExecutor(max_workers=5) as pool:
        features = [record for batch in pool.map(records, chunks) for record in batch]
    if set(ids) != {row["attributes"]["OBJECTID"] for row in features} or len(features) != len(ids):
        raise ValueError("NOAA export did not return each requested ID exactly once")
    samples = [row for feature in features if (row := normalize(feature)) is not None]
    samples.sort(key=lambda row: row[2])
    output = {"source": SOURCE, "retrievedOn": datetime.now(timezone.utc).date().isoformat(),
              "recordCount": len(ids), "unmappedCount": len(ids) - len(samples), "samples": samples}
    OUT.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    print(f"Mapped {len(samples):,} of {len(ids):,} NOAA observations ({OUT.stat().st_size:,} bytes).")


if __name__ == "__main__":
    main()
