"""Process downloaded NASA originals into small public images and quality evidence."""
import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / ".next/cache/nasa-python"))
import h5py
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ORIGINALS = ROOT / "data/nasa/originals"
PUBLIC = ROOT / "public/data/nasa-atlas"
BBOX = json.loads((ROOT / "data/pilot.json").read_text(encoding='utf-8'))["bbox"]
BOUNDS = [[BBOX[1], BBOX[0]], [BBOX[3], BBOX[2]]]
FIELDS = "HDFEOS/GRIDS/VIIRS_Grid_DNB_2d/Data Fields"
SPEC = "https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/VNP46A2/"
frames = []
sources = []


def record(path):
    if path.name.startswith("VNP46A2"):
        url = "https://data.laadsdaac.earthdatacloud.nasa.gov/prod-lads/VNP46A2/" + path.name
    else:
        granule = re.sub(r"\.(B\d\d|B8A|Fmask)\.tif$", "", path.name)
        url = f"https://data.lpdaac.earthdatacloud.nasa.gov/lp-prod-protected/HLSS30.020/{granule}/{path.name}"
    sources.append({"file": path.name, "sourceURL": url, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size})


def save_image(name, image):
    path = PUBLIC / name
    Image.fromarray(image).save(path)
    return "/data/nasa-atlas/" + name


def make_frame(name, date, title, rgb, valid, reason, source, bounds=BOUNDS):
    rgba = np.dstack((rgb, np.where(valid, 255, 0).astype("uint8")))
    image = save_image(name + ".png", rgba)
    limits = np.zeros_like(rgba)
    limits[~valid] = [112, 48, 160, 170]
    limits_url = save_image(name + "-limits.png", limits)
    frames.append({"id": name, "kind": name.split("-")[0], "title": title, "date": date, "image": image,
                   "bounds": bounds, "scale": "500 m" if name.startswith("radiance") else "30 m source",
                   "sourceURL": source, "renderedCoverage": round(float(valid.mean()), 5),
                   "limitsImage": limits_url, "limitedFraction": round(float((~valid).mean()), 5),
                   "limitation": reason, "legendURL": None})


def radiance_valid(values, quality, cloud, snow):
    valid = (values >= 0) & np.isfinite(values) & (quality == 0) & (snow == 0)
    valid &= (cloud != 65535) & ((cloud & 1) == 0) & (((cloud >> 4) & 3) >= 2)
    valid &= (((cloud >> 6) & 3) == 0) & ((cloud & (1 << 8)) == 0) & ((cloud & (1 << 9)) == 0)
    return valid


def hls_valid(qa):
    return (qa != 255) & ((qa & 14) == 0) & (((qa >> 6) & 3) < 3)


def read_radiance(day):
    doy = datetime.strptime(day, "%Y-%m-%d").strftime("%Y%j")
    matches = sorted(ORIGINALS.glob(f"VNP46A2.A{doy}.*.h5"))
    subset = ROOT / "data/nasa/subsets" / (day + ".npz")
    provenance = subset.with_suffix(".json")
    if not matches and not subset.exists():
        return None
    if subset.exists():
        with np.load(subset, allow_pickle=False) as cache:
            values, quality, cloud, snow, lat, lon = [cache[key] for key in ["values", "quality", "cloud", "snow", "lat", "lon"]]
        origin = json.loads(provenance.read_text(encoding='utf-8'))
        if origin["bbox"] != BBOX or origin["sha256"] != hashlib.sha256(subset.read_bytes()).hexdigest():
            raise ValueError("Radiance subset provenance does not match pilot or bytes")
    else:
        path = matches[-1]
        with h5py.File(path) as file:
            group = file[FIELDS]
            latitudes, longitudes = group["lat"][:], group["lon"][:]
            rows = np.flatnonzero((latitudes >= BBOX[1]) & (latitudes <= BBOX[3]))
            cols = np.flatnonzero((longitudes >= BBOX[0]) & (longitudes <= BBOX[2]))
            if not len(rows) or not len(cols):
                raise ValueError("Black Marble tile does not cover selected extent")
            window = (slice(rows.min(), rows.max() + 1), slice(cols.min(), cols.max() + 1))
            values = group["DNB_BRDF-Corrected_NTL"][window]
            quality = group["Mandatory_Quality_Flag"][window]
            cloud = group["QF_Cloud_Mask"][window]
            snow = group["Snow_Flag"][window]
            lat, lon = latitudes[rows], longitudes[cols]
        subset.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(subset, values=values, quality=quality, cloud=cloud, snow=snow, lat=lat, lon=lon)
        origin = {"bbox": BBOX, "file": subset.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(subset.read_bytes()).hexdigest(), "parentFile": path.name, "parentSha256": hashlib.sha256(path.read_bytes()).hexdigest(), "sourceURL": "https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/VNP46A2/", "transformation": "Unscaled numeric and QA arrays cropped to pilot pixel centres; NPZ is lossless, no pickle."}
        provenance.write_text(json.dumps(origin, indent=2) + "\n", encoding="utf-8", newline="\n")
    valid = radiance_valid(values, quality, cloud, snow)
    if lat[0] < lat[-1]:
        lat, values, valid = lat[::-1], values[::-1], valid[::-1]
    if lon[0] > lon[-1]:
        lon, values, valid = lon[::-1], values[:, ::-1], valid[:, ::-1]
    delta_lat = abs(float(lat[1] - lat[0])) / 2
    delta_lon = abs(float(lon[1] - lon[0])) / 2
    bounds = [[float(lat[-1] - delta_lat), float(lon[0] - delta_lon)], [float(lat[0] + delta_lat), float(lon[-1] + delta_lon)]]
    brightness = np.clip(np.arcsinh(np.maximum(values, 0) / 5) / np.arcsinh(40 / 5), 0, 1)
    rgb = np.repeat((brightness * 255).astype("uint8")[:, :, None], 3, axis=2)
    make_frame("radiance-" + day, day, "Original Black Marble quality-filtered", rgb, valid,
               "Excluded radiance pixels: missing retrieval, poor mandatory quality, snow/ice, low-quality cloud mask, cloud, shadow or cirrus. Clear areas pass this conservative filter.",
               SPEC, bounds)
    sources.append(origin)
    return values, valid, lat, lon


def hls_day(day):
    year_doy = datetime.strptime(day, "%Y-%m-%d").strftime("%Y%j")
    band_paths = {}
    for band in ["B02", "B03", "B04", "Fmask"]:
        paths = list(ORIGINALS.glob(f"HLS.S30.*.{year_doy}T*.v2.0.{band}.tif"))
        if not paths:
            return False
        band_paths[band] = paths[0]
    transform = from_bounds(*BBOX, width=768, height=768)
    arrays = {}
    for band, path in band_paths.items():
        with rasterio.open(path) as dataset:
            from rasterio.warp import transform_bounds
            extent = transform_bounds(dataset.crs, "EPSG:4326", *dataset.bounds)
            if extent[0] >= BBOX[2] or extent[2] <= BBOX[0] or extent[1] >= BBOX[3] or extent[3] <= BBOX[1]:
                return False
            fill = 255 if band == "Fmask" else -9999
            output = np.full((768, 768), fill, dtype="int32")
            reproject(source=rasterio.band(dataset, 1), destination=output, src_transform=dataset.transform,
                      src_crs=dataset.crs, dst_transform=transform, dst_crs="EPSG:4326", src_nodata=dataset.nodata,
                      dst_nodata=fill, resampling=Resampling.nearest)
            arrays[band] = output
        record(path)
    qa = arrays["Fmask"]
    # HLS v2 Fmask cloud, shadow and 150 m adjacency, plus no data and high aerosol.
    valid = hls_valid(qa)
    for band in ["B02", "B03", "B04"]:
        valid &= arrays[band] != -9999
    # Consistent reflectance stretch across dates. Snow remains visible and is not a blind spot.
    rgb = np.stack([np.clip(arrays[band] * 0.0001 / 0.4, 0, 1) for band in ["B04", "B03", "B02"]], axis=2)
    make_frame("hlsqa-" + day, day, "Original HLS · cloud/shadow QA", (rgb * 255).astype("uint8"), valid,
               "HLS Fmask flags cloud, shadow, adjacent cloud/shadow, high aerosol or missing data. Purple marks these excluded pixels; snow is retained.",
               "https://hls.gsfc.nasa.gov/data-products/")
    return True


def paired_radiance(before, after):
    if before is None or after is None:
        return {"eligiblePixels": 0, "lightLossPixels": 0, "status": "Missing original radiance input"}
    base, valid_before, lat, lon = before
    comparison, valid_after, lat_after, lon_after = after
    if not np.array_equal(lat, lat_after) or not np.array_equal(lon, lon_after):
        raise ValueError("Night-light grids must align before a paired comparison")
    eligible = valid_before & valid_after & (base >= 10)
    loss = np.zeros(base.shape, dtype=bool)
    loss[eligible] = comparison[eligible] / base[eligible] <= .6
    # Display only eligible paired observations. Missing observations stay transparent.
    rgb = np.zeros((*base.shape, 3), dtype="uint8")
    rgb[eligible] = [55, 105, 155]
    rgb[loss] = [204, 114, 42]
    half_lat = abs(float(lat[1]-lat[0]))/2
    half_lon = abs(float(lon[1]-lon[0]))/2
    bounds = [[float(lat[-1]-half_lat),float(lon[0]-half_lon)],[float(lat[0]+half_lat),float(lon[-1]+half_lon)]]
    make_frame("radiance-change-2023-02-08", "2023-02-08", "Black Marble paired light change", rgb, eligible,
               "Only pixels passing quality checks on BOTH 3 Jan and 8 Feb 2023, with baseline radiance ≥10 nW/(cm² sr), are compared. Purple excludes unavailable, poor-quality or low-baseline pairs. Orange: ≥40% lower radiance; blue: other eligible pairs. This is not building damage or proof of an outage.", SPEC, bounds)
    frames[-1]["kind"] = "radiance-change"
    features=[]
    for i,j in np.argwhere(eligible):
        west,east=float(lon[j]-half_lon),float(lon[j]+half_lon)
        south,north=float(lat[i]-half_lat),float(lat[i]+half_lat)
        features.append({"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[west,south],[east,south],[east,north],[west,north],[west,south]]]},
                         "properties":{"before":round(float(base[i,j]),5),"after":round(float(comparison[i,j]),5),"changePct":round(float((comparison[i,j]/base[i,j]-1)*100),2),"lightLoss":bool(loss[i,j]),"beforeDate":"2023-01-03","afterDate":"2023-02-08","units":"nW/(cm² sr)","nativeResolutionMeters":500,"notBuildingDamage":True}})
    (PUBLIC / "radiance-pairs.geojson").write_text(json.dumps({"type":"FeatureCollection","features":features},ensure_ascii=False)+"\n",encoding="utf-8")
    return {"eligiblePixels":int(eligible.sum()),"lightLossPixels":int(loss.sum()),"totalPixels":int(base.size),"baselineMinRadiance":10,"lightLossThresholdPct":40,
            "beforeDate":"2023-01-03","afterDate":"2023-02-08","status":"Original radiance, conservative paired quality filter; two historical dates are a screening signal, not a causal outage assessment."}


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    before, after = read_radiance("2023-01-03"), read_radiance("2023-02-08")
    zones = []
    config = json.loads((ROOT / "data/nasa/analysis-config.json").read_text(encoding='utf-8'))
    for zone in config["zones"]:
        lat_c, lon_c = zone["center"]
        half_lat = config["zoneSideMeters"] / 2 / 111320
        half_lon = half_lat / np.cos(np.radians(lat_c))
        item = {"name": zone["name"]}
        for label, observation in [("before", before), ("after", after)]:
            item[label], item[label + "Valid"] = None, 0
            if observation is None:
                continue
            values, valid, lat, lon = observation
            cell = (np.abs(lat[:, None] - lat_c) <= half_lat) & (np.abs(lon[None, :] - lon_c) <= half_lon)
            selected = cell & valid
            item[label + "Valid"] = int(selected.sum())
            if selected.any() and selected.sum() / max(1, cell.sum()) >= .8:
                item[label] = round(float(values[selected].mean()), 5)
        zones.append(item)
    paired = paired_radiance(before, after)
    hls_done = [day for day in ["2023-02-01", "2023-02-09"] if hls_day(day)]
    output = {"status": "Original Black Marble radiance filtered by mandatory quality, cloud mask and snow flags. Means use at least 80% valid cell-centre samples; these two dates alone do not establish a power outage.",
              "zones": zones, "frames": frames, "hlsProcessedDates": hls_done, "sources": sources, "pairedRadiance": paired,
              "radianceDisplay": "Shared asinh display stretch 0–40 nW/(cm² sr). Numerical means use unclipped original radiance."}
    (PUBLIC / "originals.json").write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"zones": zones, "hlsDates": hls_done, "frames": len(frames)}, indent=2))


if __name__ == "__main__":
    main()
