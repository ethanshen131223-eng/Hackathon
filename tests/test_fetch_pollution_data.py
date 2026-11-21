"""Scientific-data contract: preserve units and distinguish assisted estimates."""

from datetime import date
import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts/fetch_pollution_data.py"
SPEC = importlib.util.spec_from_file_location("fetch_pollution_data", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def feature(identifier="test", region="Med Sea", sampled="01/09/2025", density=12345, lon=4.13, lat=42.75):
    return {
        "id": f"point_c_num.{identifier}",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "trawl_num": identifier, "date": sampled, "year": int(sampled[-4:]),
            "region": region, "longitude": lon, "latitude": lat,
            "c_tot_n_km2": density,
        },
    }


class ObservationContractTests(unittest.TestCase):
    def test_preserves_areal_density_and_excludes_freshwater(self):
        records, exclusions = MODULE.normalize_features(
            [feature(), feature("lake", "Lakes"), feature("river", "Rivers")], date(2026, 11, 21)
        )
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["densityPiecesKm2"], 12345)
        self.assertEqual(records[0]["observedAt"], "2025-09-01")
        self.assertEqual(exclusions["freshwater"], 2)

    def test_labels_estimated_fraction_and_missing_uncertainty_honestly(self):
        records, _ = MODULE.normalize_features(
            [feature("old", sampled="01/09/2014"), feature("new")], date(2026, 11, 21)
        )
        records = {record["id"]: record for record in records}
        self.assertEqual(records["oceaneye:old"]["kind"], "measured")
        self.assertEqual(records["oceaneye:new"]["kind"], "model")
        self.assertIsNone(records["oceaneye:new"]["uncertainty"])

    def test_rejects_corrupt_or_ambiguous_source_values(self):
        invalid = [
            feature(density=-1), feature(density=float("nan")), feature(lon=181),
            feature(sampled="01/09/2027"), feature(region="Unknown Sea"),
        ]
        for record in invalid:
            with self.subTest(record=record):
                with self.assertRaises(ValueError):
                    MODULE.normalize_features([record], date(2026, 11, 21))

    def test_rejects_duplicate_trawls(self):
        with self.assertRaises(ValueError):
            MODULE.normalize_features([feature(), feature()], date(2026, 11, 21))


if __name__ == "__main__":
    unittest.main()
