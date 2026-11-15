"""Cache NASA browse layers and identify product-specific observation limitations."""
import argparse
import hashlib
import json
import math
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data/nasa/atlas"
PUBLIC = ROOT / "public/data/nasa-atlas"
BBOX = [38.15, 38.2, 38.5, 38.5]  # west, south, east, north
DATES = [f"2023-02-{day:02d}" for day in range(6, 11)]
GIBS = "https://gibs.earthdata.nasa.gov"
LAYERS = [
    ("snow", "MODIS_Terra_L3_NDSI_Snow_Cover_Daily", "MODIS snow index", "500 m", DATES, "MODIS_NDSI_Snow_Cover"),
    ("precipitation", "IMERG_Precipitation_Rate", "IMERG precipitation rate", "0.1° native grid", DATES, "GPM_Precipitation_Rate"),
    ("cloud", "MODIS_Terra_Cloud_Fraction_Day", "MODIS daytime cloud fraction", "5 km", DATES, "MODIS_Cloud_Fraction"),
    ("hls-before", "HLS_S30_Nadir_BRDF_Adjusted_Reflectance", "HLS Sentinel-2 before", "30 m", ["2023-02-01"], None),
    ("hls-after", "HLS_S30_Nadir_BRDF_Adjusted_Reflectance", "HLS Sentinel-2 after", "30 m", ["2023-02-09"], None),
    ("lights-before", "VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance", "Black Marble before", "500 m", ["2023-01-03"], "VIIRS_DayNightBand_At_Sensor_Radiance"),
    ("lights-after", "VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance", "Black Marble after", "500 m", ["2023-02-08"], "VIIRS_DayNightBand_At_Sensor_Radiance"),
]
MANIFEST = CACHE / "manifest.json"
records = {}
download = False
refresh = False


def fetch(path, url):
    path.parent.mkdir(parents=True, exist_ok=True)
    key = path.relative_to(ROOT).as_posix()
    old = records.get(key)
    if old and old["url"] != url:
        raise ValueError(f"Source changed for {key}; inspect before refreshing")
    if refresh or not path.exists():
        if not download:
            raise FileNotFoundError(f"{key} missing; run with --download")
        for attempt in range(3):
            try:
                with urlopen(Request(url, headers={"User-Agent": "HackTheNest26 NASA atlas"}), timeout=45) as response:
                    body = response.read()
                if path.suffix == ".png":
                    Image.open(BytesIO(body)).verify()
                elif path.suffix == ".json":
                    json.loads(body)
                elif path.suffix == ".xml":
                    ET.fromstring(body)
                temp = path.with_suffix(path.suffix + ".tmp")
                temp.write_bytes(body)
                temp.replace(path)
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    cached_at = old["cachedAt"] if old and old["sha256"] == digest and not refresh else datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()
    records[key] = {"file": key, "url": url, "sha256": digest, "cachedAt": cached_at}
    return path.read_bytes()


def public_url(path):
    return "/" + path.relative_to(ROOT / "public").as_posix()


def cloud_mask(image, colormap):
    """Only colors with documented cloud fraction >= 80 percent qualify."""
    mask = np.zeros(image.shape[:2], dtype=bool)
    for entry in ET.fromstring(colormap).iter("ColorMapEntry"):
        interval = entry.get("value", "")
        try:
            lower = float(interval.strip("[]()").split(",")[0])
        except ValueError:
            continue
        if 80 <= lower <= 100 and entry.get("transparent") == "false":
            color = [int(c) for c in entry.get("rgb").split(",")]
            mask |= (image[:, :, :3] == color).all(axis=2) & (image[:, :, 3] > 0)
    return mask


def frame_job(job):
    kind, layer, title, scale, date, cmap = job
    query = {"REQUEST": "GetSnapshot", "TIME": date, "BBOX": f"{BBOX[1]},{BBOX[0]},{BBOX[3]},{BBOX[2]}", "CRS": "EPSG:4326", "LAYERS": layer, "FORMAT": "image/png", "WIDTH": 512, "HEIGHT": 512}
    url = "https://wvs.earthdata.nasa.gov/api/v1/snapshot?" + urlencode(query)
    path = PUBLIC / f"{kind}-{date}.png"
    image = np.array(Image.open(BytesIO(fetch(path, url))).convert("RGBA"))
    mask = np.zeros(image.shape[:2], dtype=bool)
    reason = ""
    if kind == "cloud":
        mask = cloud_mask(image, (CACHE / "MODIS_Cloud_Fraction.xml").read_bytes())
        reason = "High cloud fraction (≥80%) in MODIS daytime pixels; potential obstruction for optical observations."
    elif kind.startswith("hls"):
        mask = image[:, :, 3] == 0
        reason = "No rendered HLS observation in these pixels on this acquisition date."
    elif kind.startswith("lights"):
        mask = (image[:, :, :3] == 255).all(axis=2) & (image[:, :, 3] > 0)
        reason = "Night-light browse image clipped at the white end of its display scale; brightness change cannot be measured from this rendering."
    blind_path = PUBLIC / f"{kind}-{date}-limits.png"
    # Purple limits layer is derived from the selected product, with transparent clear pixels.
    overlay = np.zeros_like(image)
    overlay[mask] = [112, 48, 160, 170]
    Image.fromarray(overlay).save(blind_path)
    return {"id": f"{kind}-{date}", "kind": kind, "title": title, "date": date,
            "image": public_url(path), "bounds": [[BBOX[1], BBOX[0]], [BBOX[3], BBOX[2]]],
            "scale": scale, "sourceURL": url, "renderedCoverage": round(float((image[:, :, 3] > 0).mean()), 5),
            "limitsImage": public_url(blind_path), "limitedFraction": round(float(mask.mean()), 5),
            "limitation": reason,
            "legendURL": f"{GIBS}/legends/{cmap}_H.svg" if cmap else None}


def main():
    global download, refresh, records
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    download, refresh = args.download or args.refresh, args.refresh
    if MANIFEST.exists():
        records = {row["file"]: row for row in json.loads(MANIFEST.read_text())["sources"]}
    for name in ["MODIS_NDSI_Snow_Cover", "MODIS_Cloud_Fraction", "GPM_Precipitation_Rate"]:
        fetch(CACHE / f"{name}.xml", f"{GIBS}/colormaps/v1.3/{name}.xml")
    catalogs = {}
    for short, concept in [("hls", "C2021957295-LPCLOUD"), ("black-marble", "C3022847860-LAADS")]:
        query = {"bounding_box": ",".join(map(str, BBOX)), "temporal": "2023-01-20T00:00:00Z,2023-02-11T00:00:00Z", "page_size": 100}
        if short == "hls":
            query["collection_concept_id"] = concept
        else:
            query["short_name"] = "VNP46A2"
        url = "https://cmr.earthdata.nasa.gov/search/granules.json?" + urlencode(query)
        catalogs[short] = json.loads(fetch(CACHE / f"{short}-granules.json", url))["feed"]["entry"]
    eonet_url = "https://eonet.gsfc.nasa.gov/api/v3/events?" + urlencode({"status": "all", "start": DATES[0], "end": DATES[-1], "limit": 1000})
    eonet = json.loads(fetch(CACHE / "eonet.json", eonet_url))
    jobs = [(kind, layer, title, scale, date, cmap) for kind, layer, title, scale, dates, cmap in LAYERS for date in dates]
    with ThreadPoolExecutor(max_workers=4) as pool:
        frames = list(pool.map(frame_job, jobs))
    events = []
    for event in eonet["events"]:
        points = [g for g in event["geometry"] if g["type"] == "Point" and DATES[0] <= g["date"][:10] <= DATES[-1]]
        if not points:
            continue
        point = points[-1]
        lon, lat = point["coordinates"][:2]
        regional = BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]
        events.append({"id": event["id"], "title": event["title"], "date": point["date"], "coords": [lat, lon], "regional": regional,
                       "sourceURL": event["link"], "categories": [c["title"] for c in event["categories"]]})
    scenes = [{"title": e.get("producer_granule_id", e["title"]), "date": e.get("time_start", ""), "sceneCloudPct": e.get("cloud_cover"), "links": [link["href"] for link in e.get("links", []) if link.get("href", "").startswith("https://") and not link.get("inherited")]} for e in catalogs["hls"]]
    original_path = PUBLIC / "originals.json"
    originals = json.loads(original_path.read_text(encoding="utf-8")) if original_path.exists() else None
    if originals:
        frames.extend(originals["frames"])
    scene_dates = {scene["date"][:10] for scene in scenes}
    missing_dates = [day for day in DATES if day not in scene_dates]
    for day in missing_dates:
        empty = np.zeros((512, 512, 4), dtype=np.uint8)
        path = PUBLIC / f"hls-gap-{day}.png"
        Image.fromarray(empty).save(path)
        empty[:] = [112, 48, 160, 170]
        limits_path = PUBLIC / f"hls-gap-{day}-limits.png"
        Image.fromarray(empty).save(limits_path)
        frames.append({"id": f"hls-gap-{day}", "kind": "hls-gap", "title": "HLS Sentinel-2 acquisition gap",
                       "date": day, "image": public_url(path), "bounds": [[BBOX[1], BBOX[0]], [BBOX[3], BBOX[2]]],
                       "scale": "30 m product; no matching scene", "sourceURL": records["data/nasa/atlas/hls-granules.json"]["url"],
                       "renderedCoverage": 0, "limitsImage": public_url(limits_path), "limitedFraction": 1,
                       "limitation": "No HLSS30 scene intersected the queried extent on this date. Other sensors may have observations.",
                       "legendURL": None})
    output = {"version": "malatya-atlas-v1", "dates": DATES, "bbox": BBOX, "frames": frames, "events": events,
              "eonetSourceURL": eonet_url, "hlsScenes": scenes,
              "hlsMissingDates": missing_dates,
              "originalMeasurements": originals,
              "originals": {"blackMarble": "Earthdata login required for radiance and quality flags", "hls": "Earthdata login required for multispectral bands and Fmask"},
              "limitsMeaning": "Product-specific observation limits. Clear pixels do not establish that the ground is safe. Snow-layer transparency alone cannot distinguish snow-free ground, clouds, water and missing data."}
    (PUBLIC / "atlas.json").write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    MANIFEST.write_text(json.dumps({"sources": sorted(records.values(), key=lambda row: row["file"])}, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"frames": len(frames), "events": len(events), "regionalEvents": sum(e["regional"] for e in events), "hlsScenes": len(scenes),
                      "limitations": [(f["id"], f["limitedFraction"]) for f in frames if f["limitation"]]}, indent=2))


if __name__ == "__main__":
    main()
