"""Render the CC BY 4.0 van Sebille et al. (2015) Figure 3e abundance grid."""
import base64
import io
import json
from pathlib import Path
import sys
from urllib.request import urlopen

import numpy as np
from PIL import Image, ImageFilter
from shapely import covers, points

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ocean_gradient import GRADIENT_COLORS, density_colors
from ocean_grid import LandMask


def source_grid(file_id):
    with urlopen(f"https://ndownloader.figshare.com/files/{file_id}", timeout=25) as response:
        return np.loadtxt(io.BytesIO(response.read()), delimiter=",")


def main():
    density = source_grid(3569462)
    if density.shape != (181, 361):
        raise ValueError(f"Unexpected abundance grid shape: {density.shape}")
    # The authors specify summing the duplicate 0° and 360° columns.
    seam = density[:, [0, -1]]
    density[:, 0] = np.where(np.isfinite(seam).any(axis=1), np.nansum(seam, axis=1), np.nan)
    density = density[:, :-1]
    density[density < 0] = np.nan
    width, height = 1440, 680
    west, south, east, north = -180, -85, 180, 85
    lon = west + (np.arange(width) + 0.5) * (east - west) / width
    lat = north - (np.arange(height) + 0.5) * (north - south) / height
    lng, lats = np.meshgrid(lon, lat)
    values = density[np.floor(90 - lats + 0.5).astype(int), np.floor(lng + 0.5).astype(int) % 360]

    land = LandMask.from_file()
    pixels = points(lng.ravel(), lats.ravel())
    pairs = land.tree.query(pixels)
    on_land = covers(np.asarray(land.parts, dtype=object)[pairs[1]], pixels[pairs[0]])
    water = np.ones(width * height, dtype=np.uint8)
    water[pairs[0][on_land]] = 0
    water = np.asarray(Image.fromarray(water.reshape(height, width)).filter(ImageFilter.MinFilter(3))) > 0
    supported = water & np.isfinite(values)
    weights = np.broadcast_to(np.cos(np.radians(lats)), values.shape)
    share = float(weights[supported].sum() / weights[water].sum())
    maximum = float(np.nanpercentile(values[supported], 95))
    rgb = density_colors(values, maximum).astype(np.uint8)
    rgba = np.dstack((rgb, np.where(supported, 235, 0).astype(np.uint8)))
    output = ROOT / "web/public/hosted"
    Image.fromarray(rgba).save(output / "global-plastic-2014.png", optimize=True)
    metadata = {
        "bounds": [west, south, east, north],
        "waterCoverage": round(share * 100, 1),
        "maskWidth": width,
        "maskHeight": height,
        "supportMask": base64.b64encode(np.packbits(supported.ravel()).tobytes()).decode("ascii"),
        "colorScale": {"maximum": maximum, "colors": GRADIENT_COLORS},
        "values": [[round(float(value), 1) if np.isfinite(value) else None for value in row] for row in density],
    }
    (output / "global-plastic-2014.json").write_text(json.dumps(metadata, separators=(",", ":")), encoding="utf-8")
    print(f"Modeled coverage: {metadata['waterCoverage']}% of mapped ocean area")


if __name__ == "__main__":
    main()
