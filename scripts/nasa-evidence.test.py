"""Regression checks for missing coverage, clipped brightness and demo geography."""

import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("prepare_nasa", ROOT / "scripts/prepare-nasa.py")
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class EvidenceTests(unittest.TestCase):
    def test_weather_units_missing_values_and_output_provenance(self):
        raw = json.loads((ROOT / "data/nasa/power-weather-malatya.json").read_text(encoding="utf-8"))
        series = prepare.weather_series(raw)
        output = json.loads((ROOT / "public/data/zones.geojson").read_text(encoding="utf-8"))
        self.assertEqual(series, output["metadata"]["weatherSeries"])
        self.assertEqual(len(series), 5)
        for row in series:
            self.assertEqual(row["minTempC"], raw["properties"]["parameter"]["T2M_MIN"][row["date"].replace("-", "")])
        day = next(row for row in series if row["date"] == "2023-02-09")
        self.assertEqual(day["humidityPct"], 78.93)
        self.assertEqual(day["precipitationMm"], 0.04)
        self.assertEqual(day["windMs"], 2.45)
        self.assertEqual(day["maxTempC"], -0.24)
        raw["properties"]["parameter"]["RH2M"]["20230209"] = raw["header"]["fill_value"]
        self.assertIsNone(next(row for row in prepare.weather_series(raw) if row["date"] == "2023-02-09")["humidityPct"])
        raw["parameters"]["WS2M"]["units"] = "km/h"
        with self.assertRaisesRegex(ValueError, "units"):
            prepare.weather_series(raw)

    def test_offline_cache_preserves_original_download_times_after_checkout(self):
        original_cache = prepare.CACHE
        manifest = json.loads((original_cache / "manifest.json").read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory(prefix="nasa-cache-test-") as directory:
            cache = Path(directory).resolve()
            self.assertTrue(cache.is_relative_to(Path(tempfile.gettempdir()).resolve()))
            for source in manifest["sources"]:
                name = Path(source["file"]).name
                (cache / name).write_bytes((original_cache / name).read_bytes())
            (cache / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            try:
                prepare.CACHE = cache
                self.assertEqual(prepare.acquire(False, False), manifest["sources"])
            finally:
                prepare.CACHE = original_cache

    def test_transparent_damage_stays_unknown(self):
        image = np.zeros((2, 2, 4), dtype=np.int16)
        result = prepare.damage_summary(image, np.ones((2, 2), dtype=bool))
        self.assertIsNone(result["damage"])
        self.assertEqual(result["flaggedOverlayFraction"], 0)
        image[0, 0] = [255, 0, 0, 255]
        result = prepare.damage_summary(image, np.ones((2, 2), dtype=bool))
        self.assertIsNone(result["damage"])
        self.assertEqual(result["flaggedOverlayFraction"], 0.25)

    def test_saturation_and_absent_coverage_stay_unknown(self):
        before = np.full((2, 2, 4), 100, dtype=np.int16)
        before[:, :, 3] = 255
        after = np.full((2, 2, 4), 255, dtype=np.int16)
        mask = np.ones((2, 2), dtype=bool)
        self.assertIsNone(prepare.lights_summary(before, after, mask)["dark"])
        after[:, :, 3] = 0
        result = prepare.lights_summary(before, after, mask)
        self.assertIsNone(result["dark"])
        self.assertEqual(result["renderedCoverage"], 0)

    def test_usable_brightness_and_dark_baseline(self):
        before = np.full((2, 2, 4), 100, dtype=np.int16)
        after = np.full((2, 2, 4), 40, dtype=np.int16)
        before[:, :, 3] = after[:, :, 3] = 255
        mask = np.ones((2, 2), dtype=bool)
        self.assertTrue(prepare.lights_summary(before, after, mask)["dark"])
        before[:, :, :3] = 0
        self.assertIsNone(prepare.lights_summary(before, after, mask)["dark"])

    def test_polygons_use_longitude_latitude_and_preserve_seed_ids(self):
        output = json.loads((ROOT / "public/data/zones.geojson").read_text(encoding="utf-8"))
        seed = json.loads((ROOT / "data/seed.json").read_text(encoding="utf-8"))
        self.assertEqual({zone["id"] for zone in output["features"]}, set(seed["regions"][0]["zoneIds"]))
        for zone, config in zip(output["features"], prepare.CONFIG["zones"]):
            ring = zone["geometry"]["coordinates"][0]
            self.assertEqual(ring[0], ring[-1])
            left, bottom, right, top = zone["bbox"]
            latitude, longitude = config["center"]
            self.assertTrue(left < longitude < right and bottom < latitude < top)
            area = sum(x * ny - nx * y for (x, y), (nx, ny) in zip(ring, ring[1:]))
            self.assertGreater(area, 0)

    def test_generated_counts_and_temperature_match_provenance(self):
        output = json.loads((ROOT / "public/data/zones.geojson").read_text(encoding="utf-8"))
        power = json.loads((ROOT / "data/nasa/power-malatya.json").read_text(encoding="utf-8"))
        minimum = power["properties"]["parameter"]["T2M_MIN"]["20230209"]
        self.assertEqual([zone["properties"]["reportPosts"] for zone in output["features"]], [4, 1])
        for zone in output["features"]:
            self.assertEqual(zone["properties"]["calls"], 1)
            self.assertEqual(zone["properties"]["minTempC"], minimum)
            self.assertIsNone(zone["properties"]["silentZone"])


if __name__ == "__main__":
    unittest.main()
