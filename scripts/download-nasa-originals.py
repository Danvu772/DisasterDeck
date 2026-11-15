"""Interactive local NASA download. Credentials stay in this process."""
import json
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".next/cache/nasa-python"))
import earthaccess

TARGET = ROOT / "data/nasa/originals"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hls-only", action="store_true")
    args = parser.parse_args()
    print("NASA Earthdata sign-in. Enter your own account here.")
    print("Your password is hidden while typing. Credentials are not saved.")
    auth = earthaccess.login(strategy="interactive", persist=False)
    if not auth.authenticated:
        raise RuntimeError("Earthdata sign-in did not complete")
    TARGET.mkdir(parents=True, exist_ok=True)
    records = []
    bbox = (38.15, 38.2, 38.5, 38.5)
    for day in ([] if args.hls_only else ["2023-01-03", "2023-02-08"]):
        print(f"Finding Black Marble for {day}...", flush=True)
        results = earthaccess.search_data(short_name="VNP46A2", version="2", bounding_box=bbox, temporal=(day + "T00:00:00Z", day + "T23:59:59Z"), count=8)
        if not results:
            raise RuntimeError(f"No VNP46A2 granule found for {day}")
        paths = earthaccess.download(results, local_path=str(TARGET), threads=2)
        records.extend({"product": "VNP46A2", "date": day, "path": str(path), "sourceURLs": [url for granule in results for url in granule.data_links()]} for path in paths)
    for day in ["2023-02-01", "2023-02-09"]:
        print(f"Finding HLS bands for {day}...", flush=True)
        results = earthaccess.search_data(short_name="HLSS30", version="2.0", bounding_box=bbox, temporal=(day + "T00:00:00Z", day + "T23:59:59Z"), count=8)
        urls = sorted({url for granule in results for url in granule.data_links() if any(url.endswith(f".{band}.tif") for band in ["B02", "B03", "B04", "B8A", "B11", "B12", "Fmask"])})
        if not urls:
            raise RuntimeError(f"No HLS bands found for {day}")
        paths = earthaccess.download(urls, local_path=str(TARGET), threads=2)
        records.extend({"product": "HLSS30", "date": day, "path": str(path), "sourceURLs": [url for url in urls if Path(url).name == Path(path).name]} for path in paths)
    index = TARGET / "index.json"
    index.write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")
    print("Downloads complete. Original files are ignored by Git.")
    print("You may close this window.")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print(str(error) if str(error).startswith("No ") else "NASA request failed; check account access permissions.")
        raise SystemExit(1)
    except Exception as error:
        # Some HTTP exceptions include authentication state; print only their class.
        print(f"Download stopped ({type(error).__name__}). Check sign-in and NASA access permissions.")
        raise SystemExit(1)
