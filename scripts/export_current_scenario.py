"""Export five years of conservative tracer transport under repeating NOAA monthly currents."""
import base64
import calendar
import io
import json
import sys
from pathlib import Path
from urllib.request import urlopen

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ocean_gradient import density_colors

URL = "https://erddap.aoml.noaa.gov/gdp/erddap/griddap/drifter_monthlymeans.csv"
HOSTED = ROOT / "web/public/hosted"
METRES_PER_DEGREE = 111_195.0


def load_currents():
    subset = "%5B0:1:11%5D%5B0:4:1439%5D%5B0:4:631%5D"
    with urlopen(f"{URL}?U{subset},V{subset}", timeout=90) as response:
        records = np.loadtxt(io.BytesIO(response.read()), delimiter=",", skiprows=2)
    month, longitude, latitude, east, north = records.T
    indices = (month.astype(int), np.rint(90 - latitude).astype(int), np.rint(longitude).astype(int) % 360)
    fields = np.full((2, 12, 181, 360), np.nan)
    fields[0][indices], fields[1][indices] = east, north
    return fields


def transport_month(mass, east, north, supported, days):
    """Conservative first-order upwind flux with closed faces at missing cells."""
    latitude = np.arange(90, -91, -1)
    cos_lat = np.maximum(1e-4, np.cos(np.deg2rad(latitude)))[:, None]
    east_face = (east + np.roll(east, -1, axis=1)) / 2
    east_face = np.where(supported & np.roll(supported, -1, axis=1), east_face, 0)
    south_face = -(north + np.roll(north, -1, axis=0)) / 2
    south_face = np.where(supported & np.roll(supported, -1, axis=0), south_face, 0)
    south_face[-1] = 0
    area = METRES_PER_DEGREE ** 2 * cos_lat
    east_flux = east_face * METRES_PER_DEGREE
    south_flux = south_face * METRES_PER_DEGREE * np.cos(np.deg2rad(latitude - 0.5))[:, None]
    outflow = (np.maximum(east_flux, 0) + np.maximum(-np.roll(east_flux, 1, axis=1), 0)
               + np.maximum(south_flux, 0) + np.maximum(-np.roll(south_flux, 1, axis=0), 0)) / area
    duration = days * 86400
    count = max(1, int(np.ceil(duration * outflow.max() / 0.8)), days)
    dt = duration / count
    for _ in range(count):
        density = mass / area
        across_east = dt * east_flux * np.where(east_flux >= 0, density, np.roll(density, -1, axis=1))
        across_south = dt * south_flux * np.where(south_flux >= 0, density, np.roll(density, -1, axis=0))
        mass += np.roll(across_east, 1, axis=1) - across_east
        mass += np.roll(across_south, 1, axis=0) - across_south
    return mass


def main():
    baseline = json.loads((HOSTED / "global-plastic-2014.json").read_text(encoding="utf-8"))
    initial = np.array(baseline["values"], dtype=float)
    currents = load_currents()
    support = np.isfinite(initial) & np.isfinite(currents).all(axis=(0, 1))
    area = METRES_PER_DEGREE ** 2 * np.maximum(1e-4, np.cos(np.deg2rad(np.arange(90, -91, -1))))[:, None]
    mass = np.where(support, initial * area, 0)
    initial_mass = mass.sum()
    width, height = baseline["maskWidth"], baseline["maskHeight"]
    water = np.unpackbits(np.frombuffer(base64.b64decode(baseline["supportMask"]), dtype=np.uint8)).reshape(height, width).astype(bool)
    west, south, east, north = baseline["bounds"]
    cols = np.floor(west + (np.arange(width) + 0.5) * (east - west) / width + 0.5).astype(int) % 360
    rows = np.floor(90 - north + (np.arange(height) + 0.5) * (north - south) / height + 0.5).astype(int)
    pixel_index = np.ix_(rows, cols)
    visible = water & support[pixel_index]
    alpha = np.where(visible, 235, 0).astype(np.uint8)
    weight = np.cos(np.deg2rad(north - (np.arange(height) + 0.5) * (north - south) / height))[:, None]
    coverage = float((weight * visible).sum() / (weight * water).sum())
    if coverage < 0.5:
        raise ValueError(f"Too little shared coverage: {coverage:.1%}")
    output = HOSTED / "current-scenario"
    output.mkdir(exist_ok=True)
    metadata = {key: baseline[key] for key in ("bounds", "colorScale", "maskWidth", "maskHeight")}
    metadata.update({
        "coverageOfBaseline": round(coverage * 100, 1),
        "supportMask": base64.b64encode(np.packbits(visible.ravel()).tobytes()).decode("ascii"),
        "years": 5,
        "currentsSource": "https://erddap.aoml.noaa.gov/gdp/erddap/info/drifter_monthlymeans/index.html",
    })
    (output / "index.json").write_text(json.dumps(metadata), encoding="utf-8")
    for year in range(6):
        if year:
            for month in range(12):
                transport_month(mass, *currents[:, month], support, calendar.monthrange(2001, month + 1)[1])
        if mass.min() < -1e-4 or not np.isclose(mass.sum(), initial_mass, rtol=1e-10):
            raise ValueError("Transport violated the tracer mass balance")
        density = np.where(support, mass / area, np.nan)
        rgb = density_colors(density[pixel_index], baseline["colorScale"]["maximum"]).astype(np.uint8)
        Image.fromarray(np.dstack((rgb, alpha))).save(output / f"year-{year}.png", optimize=True)
        values = [[round(float(value), 1) if np.isfinite(value) else None for value in row] for row in density]
        (output / f"year-{year}.json").write_text(json.dumps(values, separators=(",", ":")), encoding="utf-8")
        print(f"Year {year}: {coverage:.1%} of baseline ocean coverage; mass balance verified", flush=True)


if __name__ == "__main__":
    main()
