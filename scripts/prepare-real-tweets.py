"""Prepare an attributed, redacted historical Antakya replay from a pinned public archive.

Uses Python's standard library only. The app and replay worker use the committed JSON;
no download or Python is needed for normal replay. Raw author metadata stays ignored.
"""
import argparse
import csv
import hashlib
import io
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "data/replays"
CONFIG = DIRECTORY / "real-tweets-source.json"
CACHE = ROOT / ".next/cache/real-tweets-source"
PHONE = re.compile(r"(?<![\w.,])\+?\d(?:[\s()./-]*\d){9,14}(?!\d)")
ADDRESS = re.compile(r"\b(?:mah(?:allesi)?|sok(?:ak)?|cad(?:desi)?)(?:\.|\b)|\bapartment\s*(?:no|#)|\bno\s*[:#.]?\s*\d", re.I)


def write(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8", newline="\n")


def redact(text):
    changes = []
    for name, pattern, replacement in [
        ("phone", PHONE, "[phone redacted]"),
        ("url", re.compile(r"https?://\S+", re.I), "[link redacted]"),
        ("handle", re.compile(r"(?<![\w@])@[A-Za-z0-9_]+"), "[handle redacted]"),
        ("email", re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b"), "[email redacted]"),
    ]:
        text, count = pattern.subn(replacement, text)
        if count:
            changes.append(name)
    return text, changes


def build(body, config):
    if hashlib.sha256(body).hexdigest() != config["csvSha256"]:
        raise ValueError("Archive differs from the reviewed version; inspect provenance before replacing it")
    rows = list(csv.DictReader(io.StringIO(body.decode("utf-8-sig"))))
    selected = []
    rejected = {"invalidDate": 0, "invalidIdOrTime": 0, "privateAddressPattern": 0, "duplicateId": 0}
    seen = set()
    for index, row in enumerate(rows):
        try:
            observed = datetime.fromisoformat(row["date"])
            if observed.tzinfo is None:
                raise ValueError("timezone required")
        except (ValueError, KeyError):
            rejected["invalidDate"] += 1
            continue
        text = row["text"]
        day = observed.astimezone(timezone.utc).date().isoformat()
        if not config["startDate"] <= day <= config["endDate"] or not re.search(r"\bantakya\b", text, re.I):
            continue
        tweet_id = row["id"]
        if not re.fullmatch(r"\d{17,20}", tweet_id):
            rejected["invalidIdOrTime"] += 1
            continue
        snowflake = datetime.fromtimestamp(((int(tweet_id) >> 22) + 1288834974657) / 1000, timezone.utc)
        if abs((snowflake - observed).total_seconds()) >= 2:
            rejected["invalidIdOrTime"] += 1
            continue
        if tweet_id in seen:
            rejected["duplicateId"] += 1
            continue
        # Public demo records do not retain explicit private street-address patterns.
        if ADDRESS.search(text):
            rejected["privateAddressPattern"] += 1
            continue
        seen.add(tweet_id)
        masked, changes = redact(text)
        selected.append({
            "id": tweet_id, "text": masked, "observedAt": observed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "ts_offset_seconds": 0,
            "sourceURL": "https://x.com/i/status/" + tweet_id,
            "provenance": {"kind": "historical-real-tweet", "dataset": config["dataset"], "version": config["version"],
                           "sourceRecord": index + 1, "originalTextSha256": hashlib.sha256(text.encode()).hexdigest(),
                           "redactions": changes, "isRetweet": row.get("is_retweet", "").lower() == "true" or text.lstrip().startswith("RT @"),
                           "locationBasis": "Mentions Antakya in text; no verified incident coordinates", "synthetic": False},
        })
    selected.sort(key=lambda row: (row["observedAt"], int(row["id"])))
    for index, row in enumerate(selected):
        row["ts_offset_seconds"] = index * 4
    if not selected:
        raise ValueError("No usable records; do not replace the replay with an empty file")
    return selected, {"archiveRows": len(rows), "selected": len(selected), "rejected": rejected}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=CACHE / "gpreda-tweets.csv")
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    CACHE.mkdir(parents=True, exist_ok=True)
    if args.download:
        with urlopen(Request(config["downloadURL"], headers={"User-Agent": "HackTheNest26 historical replay"}), timeout=60) as response:
            body = response.read(32 * 1024 * 1024)
        with zipfile.ZipFile(io.BytesIO(body)) as archive:
            data = archive.read("turkey_earthquake_tweets.csv")
        args.input.write_bytes(data)
    data = args.input.read_bytes()
    records, stats = build(data, config)
    output = DIRECTORY / "antakya-real-tweets.json"
    write(output, records)
    write(DIRECTORY / "real-tweets-manifest.json", {
        "source": config, **stats, "file": output.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "firstObservedAt": records[0]["observedAt"], "lastObservedAt": records[-1]["observedAt"],
        "playbackMeaning": "Four-second synthetic playback spacing only; observedAt preserves the real archived publication time.",
        "limitations": "Historical social posts, not verified current incidents. Includes news, commentary and retweets; many should be skipped by extraction. Text mention is not a geolocation. No coordinates, translations, rescue counts or missing text are invented. Live X availability is not independently verified.",
        "privacy": "Author profile columns excluded; phones, handles, URLs and emails redacted; explicit private-address patterns excluded. This is contact redaction, not a guarantee of complete person-name anonymization.",
    })
    print(json.dumps(stats))


if __name__ == "__main__":
    main()
