"""Build portable Antakya imagery tiles and HOT/OSM destroyed-building reference data.

Normal app use needs no Python, NASA account, AWS account or tile server.
--download fetches public STAC/HDX inputs and reads source COG windows remotely.
Subsequent runs rebuild tiles from the lossless cropped mosaics in .next/cache.
"""
import argparse
import hashlib
import json
import math
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".next/cache/nasa-python"))
import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.warp import transform_bounds, reproject
from rasterio.vrt import WarpedVRT

PILOT = json.loads((ROOT / "data/pilot.json").read_text(encoding='utf-8'))
CACHE = ROOT / "data/imagery/antakya"
LARGE = ROOT / ".next/cache/antakya-imagery"
PUBLIC = ROOT / "public/data/antakya"
EVENT = "https://maxar-opendata.s3.amazonaws.com/events/Kahramanmaras-turkey-earthquake-23/collection.json"
HDX = "https://data.humdata.org/api/3/action/package_show?id=hotosm_tur_destroyed_buildings"
ACQUISITIONS = {"before": "10300100DF6BFE00", "after": "10300100E18CB600"}
ZOOM = 17
WORLD = 20037508.342789244
SOURCES = []


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8", newline="\n")


def cached(name, url, download):
    path = CACHE / name
    if not path.exists():
        if not download:
            raise FileNotFoundError(f"Missing {path}; run with --download")
        with urlopen(Request(url, headers={"User-Agent": "HackTheNest26 Antakya pilot"}), timeout=60) as response:
            body = response.read()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
    SOURCES.append({"file": path.relative_to(ROOT).as_posix(), "url": url,
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    return path.read_bytes()


def intersects(a, b):
    return a[0] < b[2] and a[2] > b[0] and a[1] < b[3] and a[3] > b[1]


def tile_extent(box):
    left, bottom, right, top = transform_bounds("EPSG:4326", "EPSG:3857", *box)
    span = WORLD * 2 / 2**ZOOM
    x0, x1 = math.floor((left + WORLD) / span), math.ceil((right + WORLD) / span)
    y0, y1 = math.floor((WORLD - top) / span), math.ceil((WORLD - bottom) / span)
    return x0, y0, x1, y1, span


def tiles(label, collection, download):
    acquisition = ACQUISITIONS[label]
    link = next(l for l in collection["links"] if l["rel"] == "child" and acquisition in l["href"])
    url = urljoin(EVENT, link["href"])
    data = json.loads(cached(acquisition + "-collection.json", url, download))
    links = [urljoin(url, l["href"]) for l in data["links"] if l["rel"] == "item"]
    def item(u):
        name = "stac/" + "/".join(u.split("/")[-4:])
        return u, json.loads(cached(name, u, download))
    with ThreadPoolExecutor(max_workers=8) as pool:
        selected = [(u, d) for u, d in pool.map(item, links) if intersects(d["bbox"], PILOT["imageryBbox"])]
    if not selected:
        raise ValueError("No imagery intersects the pilot")
    # Never silently mix dates or cloudy scenes into the pair.
    if any(d["properties"]["datetime"][:10] != PILOT[label + "Date"] for _, d in selected):
        raise ValueError("Acquisition date mismatch")
    if any(d["properties"].get("tile:clouds_percent", 100) != 0 for _, d in selected):
        raise ValueError("Inspect cloudy tiles before changing the selected pair")
    x0, y0, x1, y1, span = tile_extent(PILOT["imageryBbox"])
    width, height = (x1-x0)*256, (y1-y0)*256
    fingerprint = hashlib.sha256(json.dumps({"bbox": PILOT["imageryBbox"], "zoom": ZOOM, "sources": selected}, sort_keys=True).encode()).hexdigest()[:16]
    mosaic_file = LARGE / (label + "-" + fingerprint + ".npz")
    transform = from_origin(-WORLD + x0*span, WORLD-y0*span, span/256, span/256)
    if mosaic_file.exists():
        with np.load(mosaic_file, allow_pickle=False) as cache:
            mosaic = cache["rgba"]
        if mosaic.shape != (height, width, 4):
            raise ValueError("Remove stale .next/cache/antakya-imagery before rebuilding another extent")
    else:
        if not download:
            raise FileNotFoundError("Source mosaic missing; rebuild once with --download")
        mosaic = np.zeros((height, width, 4), dtype="uint8")
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT="60", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
            for u, d in selected:
                source = urljoin(u, d["assets"]["visual"]["href"])
                print("Reading", label, d["properties"]["grid:code"], flush=True)
                with rasterio.open(source) as src, WarpedVRT(src, crs="EPSG:3857", transform=transform,
                        width=width, height=height, resampling=Resampling.bilinear, nodata=0) as vrt:
                    # Bounded memory, one 512-row strip at a time.
                    for row in range(0, height, 512):
                        count = min(512, height-row)
                        rgb = vrt.read([1,2,3], window=rasterio.windows.Window(0,row,width,count)).transpose(1,2,0)
                        valid = (rgb != 0).any(axis=2)
                        target = mosaic[row:row+count]
                        target[valid,:3] = rgb[valid]
                        target[valid,3] = 255
        LARGE.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(mosaic_file, rgba=mosaic)
    current = Image.fromarray(mosaic)
    coverage = float((mosaic[:,:,3]>0).mean())
    coverage_grid = np.zeros((512,512),dtype="uint8")
    reproject(source=mosaic[:,:,3],destination=coverage_grid,src_transform=transform,src_crs="EPSG:3857",
              dst_transform=rasterio.transform.from_bounds(*PILOT["imageryBbox"],512,512),dst_crs="EPSG:4326",resampling=Resampling.nearest)
    limits=np.zeros((512,512,4),dtype="uint8")
    limits[coverage_grid==0]=[112,48,160,170]
    Image.fromarray(limits).save(PUBLIC / (label+"-limits.png"))
    del mosaic
    outputs = []
    ax0, ay0, ax1, ay1 = x0, y0, x1, y1
    for z in range(ZOOM, 10, -1):
        for x in range(ax0, ax1):
            for y in range(ay0, ay1):
                part = current.crop(((x-ax0)*256,(y-ay0)*256,(x-ax0+1)*256,(y-ay0+1)*256))
                path = PUBLIC / label / str(z) / str(x) / (str(y)+".webp")
                path.parent.mkdir(parents=True, exist_ok=True)
                part.save(path, format="WEBP", quality=82, method=4)
                outputs.append({"file": path.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size})
        nx0, ny0, nx1, ny1 = ax0//2, ay0//2, (ax1+1)//2, (ay1+1)//2
        padded = Image.new("RGBA",((nx1-nx0)*512,(ny1-ny0)*512))
        padded.paste(current,((ax0-nx0*2)*256,(ay0-ny0*2)*256))
        current = padded.resize(((nx1-nx0)*256,(ny1-ny0)*256),Image.Resampling.LANCZOS)
        ax0, ay0, ax1, ay1 = nx0, ny0, nx1, ny1
    # Source GSD and exported map resolution are intentionally different fields.
    return {"date": PILOT[label+"Date"], "tileURL": f"/data/antakya/{label}/{{z}}/{{x}}/{{y}}.webp",
            "minZoom": 11, "maxNativeZoom": ZOOM, "bounds": [[PILOT["imageryBbox"][1],PILOT["imageryBbox"][0]],[PILOT["imageryBbox"][3],PILOT["imageryBbox"][2]]],
            "sourceGsdMeters": [d["properties"]["gsd"] for _,d in selected], "exportGsdApproxMeters": round(span/256*math.cos(math.radians(PILOT["center"][0])),3),
            "coverageFraction": round(coverage,5), "metadataURLs": [u for u,_ in selected], "tiles": outputs}


def buildings(download):
    package = json.loads(cached("hdx-package.json", HDX, download))["result"]
    if package["license_id"] != "hdx-odc-odbl":
        raise ValueError("Recheck changed HDX license before redistributing")
    resource = next(r for r in package["resources"] if r["format"].lower()=="geojson")
    body = cached("destroyed-buildings.zip", resource["url"], download)
    with ZipFile(BytesIO(body)) as archive:
        name = next(n for n in archive.namelist() if n.endswith('.geojson'))
        data = json.loads(archive.read(name))
    features = []
    for f in data["features"]:
        g = f["geometry"]
        if g["type"] != "Polygon":
            continue
        points = g["coordinates"][0]; xs,ys = zip(*points)
        if not intersects([min(xs),min(ys),max(xs),max(ys)],PILOT["bbox"]):
            continue
        p = f["properties"]
        # Do not reclassify a reference polygon or invent model confidence.
        keep = {k:p[k] for k in ["osm_id","osm_type","source","damage:date","destroyed:building","damage:type"] if k in p}
        keep.update(referenceId=str(p.get("osm_id",f.get("id",len(features)))),assessment="OSM mapped destroyed building",origin="HOT / OpenStreetMap historical reference",modelPrediction=False)
        features.append({"type":"Feature","geometry":g,"properties":keep})
    metadata = {"sourceURL":"https://data.humdata.org/dataset/hotosm_tur_destroyed_buildings", "resourceURL":resource["url"],
                "license":"ODbL-1.0","attribution":"© OpenStreetMap contributors; Humanitarian OpenStreetMap Team / HDX", "resourceLastModified":resource.get("last_modified"),
                "limitations":"Historical community mapping; incomplete coverage and positional differences are possible. Not field validation, our model output, occupancy data or a complete inventory of safe/unsafe buildings. Export may include annotations made after the scenario date."}
    write(PUBLIC / "buildings.geojson",{"type":"FeatureCollection","bbox":PILOT["bbox"],"metadata":metadata,"features":features})
    return {**metadata,"count":len(features)}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download",action="store_true")
    args=parser.parse_args()
    PUBLIC.mkdir(parents=True, exist_ok=True)
    collection=json.loads(cached("collection.json", EVENT,args.download))
    result={"pilot":PILOT,"attribution":"Imagery © Maxar Open Data Program, CC BY-NC 4.0", "license":"CC-BY-NC-4.0", "sourceURL":"https://registry.opendata.aws/maxar-open-data/",
            "limitations":"Historical before/after comparison. Different view angles, shadows, seasonal change and registration differences can resemble damage. No automated damage classifier is bundled. Native source GSD differs from the ~1 m exported map grid."}
    for label in ACQUISITIONS:
        result[label]=tiles(label,collection,args.download)
    before=np.array(Image.open(PUBLIC / "before-limits.png"))
    after=np.array(Image.open(PUBLIC / "after-limits.png"))
    before[after[:,:,3]>0]=[112,48,160,170]
    Image.fromarray(before).save(PUBLIC / "pair-limits.png")
    result["pairMissingFraction"]=round(float((before[:,:,3]>0).mean()),5)
    result["buildings"]=buildings(args.download)
    write(PUBLIC / "imagery.json",result)
    write(CACHE / "manifest.json",{"sources":sorted(SOURCES,key=lambda x:x["file"]), "generatedAt":datetime.now(timezone.utc).isoformat()})
    print(json.dumps({"tiles":sum(len(result[l]["tiles"]) for l in ACQUISITIONS),"bytes":sum(t["bytes"] for l in ACQUISITIONS for t in result[l]["tiles"]),"buildings":result["buildings"]["count"]}))


if __name__=="__main__":
    main()
