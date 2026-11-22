"""Package Natural Earth marine polygons for offline point-in-area lookup."""
import json
from pathlib import Path
from urllib.request import urlopen

from shapely import make_valid
from shapely.geometry import shape

SOURCE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_geography_marine_polys.geojson"
OUTPUT = Path(__file__).resolve().parents[1] / "web/public/hosted/waterbodies.json"


def main():
    with urlopen(SOURCE, timeout=25) as response:
        features = json.load(response)["features"]
    areas = []
    for feature in features:
        props = feature["properties"]
        if not props["name"] or props["featurecla"] == "generic":
            continue
        geom = make_valid(shape(feature["geometry"])).simplify(0.025, preserve_topology=True)
        for part in getattr(geom, "geoms", [geom]):
            if part.geom_type != "Polygon" or part.is_empty:
                continue
            rings = [[(round(x, 4), round(y, 4)) for x, y in ring.coords]
                     for ring in (part.exterior, *part.interiors)]
            areas.append([props["name"], props["featurecla"], [round(v, 5) for v in part.bounds], rings, geom.area])
    areas.sort(key=lambda area: area[4])
    OUTPUT.write_text(json.dumps({"areas": [area[:4] for area in areas]}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Packaged {len(areas)} Natural Earth polygons.")


if __name__ == "__main__":
    main()
