"""Build the historical Malatya map from cached evidence. --download fetches missing inputs."""

import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data/nasa"
CONFIG = json.loads((CACHE / "analysis-config.json").read_text(encoding="utf-8"))
LAYER = "VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance"
ARIA = "https://gis.earthdata.nasa.gov/portal/rest/services/DISASTERS_202302_EARTHQUAKE_TURKIYE/2302_opera_dpm/ImageServer"
CAPABILITIES = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml"


def source_urls():
    west, south, east, north = CONFIG["bbox"]
    width, height = CONFIG["imageSize"]
    export = {
        "bbox": f"{west},{south},{east},{north}", "bboxSR": 4326, "imageSR": 4326,
        "size": f"{width},{height}", "format": "png32", "interpolation": "RSP_NearestNeighbor",
        "adjustAspectRatio": "false",
    }
    urls = {
        "aria-service.json": ARIA + "?f=pjson",
        "aria-catalog.json": ARIA + "/query?" + urlencode({"where": "1=1", "outFields": "*", "returnGeometry": "false", "f": "pjson"}),
        "aria-malatya.png": ARIA + "/exportImage?" + urlencode({**export, "f": "image"}),
        "aria-export.json": ARIA + "/exportImage?" + urlencode({**export, "f": "pjson"}),
        "lights-layer.xml": CAPABILITIES,
        "lights-colormap.xml": "https://gibs.earthdata.nasa.gov/colormaps/v1.3/VIIRS_DayNightBand_At_Sensor_Radiance.xml",
        "power-malatya.json": "https://power.larc.nasa.gov/api/temporal/daily/point?" + urlencode({
            "parameters": "T2M_MIN", "community": "RE", "longitude": 38.31, "latitude": 38.35,
            "start": "20230206", "end": "20230210", "format": "JSON",
        }),
        "power-weather-malatya.json": "https://power.larc.nasa.gov/api/temporal/daily/point?" + urlencode({
            "parameters": "T2M_MIN,T2M_MAX,RH2M,PRECTOTCORR,WS2M", "community": "AG",
            "longitude": 38.31, "latitude": 38.35,
            "start": "20230206", "end": "20230210", "format": "JSON",
        }),
        "landmark.json": "https://nominatim.openstreetmap.org/search?" + urlencode({"q": "Yeni Cami, Malatya, Turkey", "format": "json", "limit": 1}),
    }
    for name, date in [("before", CONFIG["lightsBeforeDate"]), ("after", CONFIG["lightsAfterDate"])]:
        urls[f"lights-{name}.png"] = "https://wvs.earthdata.nasa.gov/api/v1/snapshot?" + urlencode({
            "REQUEST": "GetSnapshot", "TIME": date, "BBOX": f"{south},{west},{north},{east}",
            "CRS": "EPSG:4326", "LAYERS": LAYER, "FORMAT": "image/png", "WIDTH": width, "HEIGHT": height,
        })
    return urls


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    temporary.replace(path)


def acquire(download, refresh):
    manifest_path = CACHE / "manifest.json"
    previous = {item["file"]: item for item in load_json(manifest_path)["sources"]} if manifest_path.exists() else {}
    records = []
    for name, url in source_urls().items():
        path = CACHE / name
        if refresh or (download and not path.exists()):
            request = Request(url, headers={"User-Agent": "HackTheNest26 NASA evidence preparation"})
            with urlopen(request, timeout=45) as response:
                content = response.read()
            if name == "lights-layer.xml":
                root = ET.fromstring(content)
                layers = root.findall(".//{http://www.opengis.net/wmts/1.0}Layer")
                layer = next(node for node in layers if node.find("{http://www.opengis.net/ows/1.1}Identifier").text == LAYER)
                content = ET.tostring(layer, encoding="utf-8")
            if name.endswith(".json"):
                decoded = json.loads(content)
                if isinstance(decoded, dict) and "error" in decoded:
                    raise ValueError(f"{name} returned an API error")
            temporary = path.with_suffix(path.suffix + ".tmp")
            temporary.write_bytes(content)
            temporary.replace(path)
        if not path.exists():
            raise FileNotFoundError(f"Missing {path}. Run with --download to fetch it.")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        old = previous.get(f"data/nasa/{name}", {})
        if old and old["url"] != url and not refresh:
            raise ValueError(f"Source URL changed for {name}. Run with --refresh.")
        cached_at = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()
        if old.get("sha256") == digest and not refresh:
            cached_at = old["cachedAt"]
        records.append({
            "file": f"data/nasa/{name}", "url": url,
            "sha256": digest, "cachedAt": cached_at,
            "transformation": "Selected WMTS Layer element" if name == "lights-layer.xml" else "Unmodified HTTP body",
        })
    return records


def read_image(name):
    with Image.open(CACHE / name) as image:
        if list(image.size) != CONFIG["imageSize"]:
            raise ValueError(f"Unexpected dimensions in {name}")
        return np.asarray(image.convert("RGBA")).astype(np.int16)


def pixel_mask(box):
    west, south, east, north = CONFIG["bbox"]
    width, height = CONFIG["imageSize"]
    longitudes = west + (np.arange(width) + 0.5) * (east - west) / width
    latitudes = north - (np.arange(height) + 0.5) * (north - south) / height
    left, bottom, right, top = box
    return (latitudes[:, None] >= bottom) & (latitudes[:, None] < top) & (longitudes[None, :] >= left) & (longitudes[None, :] < right)


def damage_summary(image, mask):
    red, green, blue, alpha = np.moveaxis(image, 2, 0)
    # The service describes a yellow-to-red palette. This is only an overlay-area statistic.
    colored = (alpha > 0) & (red >= 120) & (green <= red) & (blue <= 32)
    return {
        "damage": None,
        "flaggedOverlayFraction": round(float(colored[mask].mean()), 6),
        "opaqueFraction": round(float((alpha[mask] > 0).mean()), 6),
        "quality": "unflagged-validity-unknown",
    }


def lights_summary(before, after, mask):
    thresholds = CONFIG["thresholds"]
    valid = mask & (before[:, :, 3] > 0) & (after[:, :, 3] > 0)
    coverage = float(valid.sum() / mask.sum())
    result = {"dark": None, "renderedCoverage": round(coverage, 6), "quality": "insufficient-rendered-coverage"}
    if coverage < thresholds["minRenderedCoverage"] or not valid.any():
        return result
    baseline = before[:, :, :3].mean(axis=2)[valid]
    comparison = after[:, :, :3].mean(axis=2)[valid]
    saturation = max(float((baseline >= 255).mean()), float((comparison >= 255).mean()))
    result.update({
        "beforeMeanBrightness": round(float(baseline.mean()), 4),
        "afterMeanBrightness": round(float(comparison.mean()), 4),
        "maxSaturatedFraction": round(saturation, 6),
    })
    if baseline.mean() < thresholds["minBaselineBrightness"]:
        result["quality"] = "baseline-too-dark"
    elif saturation > thresholds["maxSaturatedFraction"]:
        result["quality"] = "saturated-rendering"
    else:
        ratio = float(comparison.mean() / baseline.mean())
        result.update({"brightnessRatio": round(ratio, 6), "dark": ratio <= thresholds["darkMaxBrightnessRatio"], "quality": "rendered-brightness-proxy"})
    return result


def zone_box(center):
    latitude, longitude = center
    half_lat = CONFIG["zoneSideMeters"] / 2 / 111320
    half_lon = half_lat / math.cos(math.radians(latitude))
    return [round(longitude - half_lon, 8), round(latitude - half_lat, 8), round(longitude + half_lon, 8), round(latitude + half_lat, 8)]


def weather_series(power):
    fields = {
        "T2M_MIN": ("minTempC", "C"), "T2M_MAX": ("maxTempC", "C"),
        "RH2M": ("humidityPct", "%"), "PRECTOTCORR": ("precipitationMm", "mm/day"),
        "WS2M": ("windMs", "m/s"),
    }
    values = power["properties"]["parameter"]
    dates = sorted({day for parameter in fields for day in values[parameter]})
    for parameter, (_, units) in fields.items():
        if power["parameters"][parameter]["units"] != units:
            raise ValueError(f"Unexpected weather units for {parameter}")
    if power["header"]["time_standard"] != "LST":
        raise ValueError("Weather series must use local solar days")
    observations = []
    for day in dates:
        observation = {"date": datetime.strptime(day, "%Y%m%d").date().isoformat()}
        for parameter, (field, _) in fields.items():
            value = values[parameter].get(day)
            observation[field] = value if value is not None and value != power["header"]["fill_value"] and math.isfinite(value) else None
        observations.append(observation)
    return observations


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true", help="Download missing source files")
    parser.add_argument("--refresh", action="store_true", help="Replace every cached source from the network")
    args = parser.parse_args()
    records = acquire(args.download, args.refresh)
    service = load_json(CACHE / "aria-service.json")
    export = load_json(CACHE / "aria-export.json")
    actual_extent = [export["extent"][key] for key in ["xmin", "ymin", "xmax", "ymax"]]
    if not np.allclose(actual_extent, CONFIG["bbox"], rtol=0, atol=1e-9):
        raise ValueError("ARIA returned a different geographic extent")
    if service["bandCount"] != 4 or service["pixelType"] != "U8":
        raise ValueError("Reinspect the changed ARIA product before calculating")
    layer = ET.parse(CACHE / "lights-layer.xml").getroot()
    if layer.find("{http://www.opengis.net/ows/1.1}Identifier").text != LAYER:
        raise ValueError("Wrong Black Marble layer")
    colormap = ET.parse(CACHE / "lights-colormap.xml")
    white = next(node for node in colormap.iter("ColorMapEntry") if node.get("rgb") == "255,255,255")
    power = load_json(CACHE / "power-malatya.json")
    weather = weather_series(load_json(CACHE / "power-weather-malatya.json"))
    values = power["properties"]["parameter"]["T2M_MIN"]
    minimum = values[CONFIG["temperatureDate"].replace("-", "")]
    if power["parameters"]["T2M_MIN"]["units"] != "C" or minimum == power["header"]["fill_value"] or not math.isfinite(minimum):
        raise ValueError("Missing temperature or unexpected units")
    seed = load_json(ROOT / "data/seed.json")
    if {zone["id"] for zone in CONFIG["zones"]} != {key for region in seed["regions"] for key in region["zoneIds"]}:
        raise ValueError("Zone IDs disagree with seed metadata")
    replay = load_json(ROOT / "data/tweets_replay.json")
    if set(CONFIG["reportOrigins"]) != {post["id"] for post in replay}:
        raise ValueError("Update report provenance for the changed replay")
    aria, before, after = [read_image(name) for name in ["aria-malatya.png", "lights-before.png", "lights-after.png"]]
    features = []
    for zone in CONFIG["zones"]:
        box = zone_box(zone["center"])
        left, bottom, right, top = box
        mask = pixel_mask(box)
        if not mask.any():
            raise ValueError("Zone lies outside the cached extent")
        damage = damage_summary(aria, mask)
        lights = lights_summary(before, after, mask)
        start, end = CONFIG["reportWindowSeconds"]
        posts = [post for post in replay if start <= post["ts_offset_seconds"] < end and left <= post["coords"][1] < right and bottom <= post["coords"][0] < top]
        calls = len({CONFIG["reportOrigins"][post["id"]] for post in posts})
        thresholds = CONFIG["thresholds"]
        silent = None
        if calls > thresholds["fewCallsMax"] or lights["dark"] is False:
            silent = False
        if damage["damage"] is not None and lights["dark"] is not None:
            silent = damage["damage"] >= thresholds["heavyDamageMinFraction"] and lights["dark"] and calls <= thresholds["fewCallsMax"]
        properties = {
            "_id": zone["id"], "name": zone["name"], "deskId": CONFIG["deskId"], "region": "malatya-merkez",
            "damage": damage["damage"], "dark": lights["dark"], "calls": calls, "silentZone": silent,
            "cold": minimum < 0, "minTempC": minimum, "reportPosts": len(posts),
            "callsBasis": "synthetic-distinct-original-calls", "geometryOrigin": "500m-demo-cell",
            "observedAt": CONFIG["damageDate"] + "T23:59:59Z",
            "temperatureObservedAt": CONFIG["temperatureDate"] + "T23:59:59Z",
            "damageEvidence": damage, "lightsEvidence": lights,
            "temperatureEvidence": {"date": CONFIG["temperatureDate"], "timeStandard": power["header"]["time_standard"], "units": "C", "source": "NASA POWER / MERRA-2", "gridDegrees": [0.5, 0.625], "queryCoords": [38.35, 38.31]},
        }
        features.append({"type": "Feature", "id": zone["id"], "bbox": box, "geometry": {"type": "Polygon", "coordinates": [[[left, bottom], [right, bottom], [right, top], [left, top], [left, bottom]]]}, "properties": properties})
    landmark = load_json(CACHE / "landmark.json")[0]
    point = [float(landmark["lon"]), float(landmark["lat"])]
    nearby = pixel_mask(zone_box([point[1], point[0]]))
    metadata = {
        "version": CONFIG["version"], "deskId": CONFIG["deskId"], "scenarioAt": CONFIG["scenarioAt"],
        "bboxOrder": "west,south,east,north", "coordinateOrder": "longitude,latitude", "thresholds": CONFIG["thresholds"],
        "dates": {key: CONFIG[key] for key in ["damageDate", "lightsBeforeDate", "lightsAfterDate", "temperatureDate"]},
        "nativeResolutionMeters": {"damage": 30, "nightLights": 500, "temperatureApprox": 50000},
        "temperatureSeries": [
            {"date": f"{day[:4]}-{day[4:6]}-{day[6:]}", "minTempC": value}
            for day, value in sorted(values.items())
            if value != power["header"]["fill_value"] and math.isfinite(value)
        ],
        "weatherSeries": weather,
        "weatherSourceURL": source_urls()["power-weather-malatya.json"],
        "sourcesManifestRepositoryPath": "data/nasa/manifest.json", "reportWindowSeconds": CONFIG["reportWindowSeconds"],
        "sourceURLs": {"damage": ARIA, "nightLights": CAPABILITIES, "nightLightsColormap": source_urls()["lights-colormap.xml"], "temperature": source_urls()["power-malatya.json"]},
        "attribution": "NASA JPL/Caltech ARIA Team, Copernicus, ESA; NASA GIBS / Suomi NPP VIIRS Black Marble; NASA POWER / MERRA-2",
        "whiteRadianceInterval": white.get("value"), "missingValue": None,
        "observedAtMeaning": "Conservative UTC end-of-product-date label; exact acquisition time unavailable; POWER source days use LST",
    }
    write_json(ROOT / "public/data/zones.geojson", {"type": "FeatureCollection", "bbox": CONFIG["bbox"], "metadata": metadata, "features": features})
    write_json(CACHE / "manifest.json", {"sources": records, "cachedAtMeaning": "UTC modification time of the downloaded cache file", "configurationSha256": hashlib.sha256((CACHE / "analysis-config.json").read_bytes()).hexdigest()})
    write_json(CACHE / "validation.json", {
        "ariaExtentMatches": True, "landmark": {"name": landmark["name"], "coordsLngLat": point, "osmWayId": landmark["osm_id"]},
        "landmark500mEvidence": {"damage": damage_summary(aria, nearby), "lights": lights_summary(before, after, nearby)},
        "independentReport": {"url": "https://www.dha.com.tr/gundem/malatyada-depremde-yeni-cami-de-yikildi-2201455", "publishedAt": "2023-02-06T10:47:00+03:00", "finding": "The reporter documented collapse of Yeni Cami. The surrounding rendered overlay flags surface change; validity and power outage remain unresolved."},
    })
    print(json.dumps({"zones": [{"id": item["id"], "calls": item["properties"]["calls"], "dark": item["properties"]["dark"], "silentZone": item["properties"]["silentZone"], "minTempC": item["properties"]["minTempC"]} for item in features]}, indent=2))


if __name__ == "__main__":
    main()
