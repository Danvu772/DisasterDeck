"""Scientific and provenance checks for the NASA atlas."""
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
import unittest
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / filename)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


atlas = module("atlas", "prepare-nasa-atlas.py")
originals = module("originals", "prepare-nasa-originals.py")


class AtlasTests(unittest.TestCase):
    def test_cloud_threshold_uses_percent_and_excludes_transparent_nodata(self):
        cmap = b'<ColorMaps><ColorMap><Entries><ColorMapEntry value="79" rgb="1,2,3" transparent="false"/><ColorMapEntry value="80" rgb="4,5,6" transparent="false"/><ColorMapEntry value="100" rgb="7,8,9" transparent="false"/><ColorMapEntry value="127" rgb="10,11,12" transparent="true"/></Entries></ColorMap></ColorMaps>'
        image = np.array([[[1,2,3,255],[4,5,6,255],[7,8,9,255],[10,11,12,0]]], dtype=np.uint8)
        self.assertEqual(atlas.cloud_mask(image, cmap).tolist(), [[False, True, True, False]])

    def test_hls_cloud_shadow_adjacency_and_aerosol_exclude_but_snow_is_retained(self):
        qa = np.array([0, 2, 4, 8, 16, 32, 192, 255], dtype=np.uint8)
        self.assertEqual(originals.hls_valid(qa).tolist(), [True, False, False, False, True, True, False, False])

    def test_radiance_uses_actual_quality_and_never_treats_fill_as_zero(self):
        values = np.array([10, -999.9, 10, 10, 10, 10, 10], dtype=float)
        quality = np.array([0, 0, 1, 0, 0, 0, 0])
        cloud = np.array([48, 48, 48, 48, 48 | 192, 48 | 256, 49])
        snow = np.array([0, 0, 0, 1, 0, 0, 0])
        self.assertEqual(originals.radiance_valid(values, quality, cloud, snow).tolist(), [True, False, False, False, False, False, False])

    def test_cache_hashes_and_public_overlay_masks_match(self):
        manifest = json.loads((ROOT / "data/nasa/atlas/manifest.json").read_text())
        for source in manifest["sources"]:
            self.assertEqual(hashlib.sha256((ROOT / source["file"]).read_bytes()).hexdigest(), source["sha256"])
        output = json.loads((ROOT / "public/data/nasa-atlas/atlas.json").read_text(encoding="utf-8"))
        self.assertEqual(len({f["id"] for f in output["frames"]}), len(output["frames"]))
        for frame in output["frames"]:
            self.assertLess(frame["bounds"][0][0], frame["bounds"][1][0])
            self.assertLess(frame["bounds"][0][1], frame["bounds"][1][1])
            image = np.array(Image.open(ROOT / "public" / frame["image"].lstrip("/")).convert("RGBA"))
            limits = np.array(Image.open(ROOT / "public" / frame["limitsImage"].lstrip("/")).convert("RGBA"))
            self.assertEqual(image.shape, limits.shape)
            self.assertAlmostEqual(float((limits[:,:,3] > 0).mean()), frame["limitedFraction"], places=4)
        for event in output["events"]:
            self.assertTrue("2023-02-06" <= event["date"][:10] <= "2023-02-10")
        self.assertEqual([f["date"] for f in output["frames"] if f["kind"] == "hls-gap"], output["hlsMissingDates"])

    def test_missing_after_samples_preserve_no_outage_conclusion(self):
        data = json.loads((ROOT / "public/data/nasa-atlas/originals.json").read_text(encoding="utf-8"))
        self.assertEqual(data["hlsProcessedDates"], ["2023-02-01", "2023-02-09"])
        for zone in data["zones"]:
            if zone["afterValid"] == 0:
                self.assertIsNone(zone["after"])


if __name__ == "__main__":
    unittest.main()
