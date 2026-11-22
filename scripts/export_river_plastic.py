"""Export Meijer et al. (2021) CC BY 4.0 river emissions (requires pyshp)."""
import io
import json
import math
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile

import shapefile

SOURCE = "https://doi.org/10.6084/m9.figshare.14515590"
DOWNLOAD = "https://ndownloader.figshare.com/files/27807774"
OUT = Path(__file__).resolve().parents[1] / "web/public/hosted/river-plastic.json"


def main():
    with urlopen(DOWNLOAD, timeout=45) as response:
        archive = ZipFile(io.BytesIO(response.read()))
    name = "Meijer2021_midpoint_emissions"
    reader = shapefile.Reader(shp=io.BytesIO(archive.read(f"{name}.shp")),
                              dbf=io.BytesIO(archive.read(f"{name}.dbf")))
    rows = []
    for item in reader.iterShapeRecords():
        (longitude, latitude), = item.shape.points
        emission = item.record["dots_exten"]
        if not (abs(longitude) <= 180 and abs(latitude) <= 90 and math.isfinite(emission) and emission >= 0):
            raise ValueError(f"Unexpected river outfall at record {item.record.oid}")
        rows.append([round(longitude, 5), round(latitude, 5), item.record.oid + 1, emission])
    if len(rows) != 31819:
        raise ValueError(f"Incomplete Meijer et al. export: {len(rows)} outfalls")
    OUT.write_text(json.dumps({"source": SOURCE, "samples": rows}, separators=(",", ":")), encoding="utf-8")
    print(f"Mapped {len(rows):,} river outfalls ({OUT.stat().st_size:,} bytes).")


if __name__ == "__main__":
    main()
