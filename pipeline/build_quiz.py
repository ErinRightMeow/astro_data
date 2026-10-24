"""Build the chart-guessing game's deck from the Open Gauquelin Database.

The Open Gauquelin Database (https://opengauquelin.org, CC BY-SA 4.0)
collects the birth records Michel and Françoise Gauquelin gathered from
civil registers, with exact birth times. Each card keeps what a player may
know about a person (occupation, country, sex, birth year, name) and the
answers (Ascendant, Moon and Sun signs). The birth day is left out because
it gives away the Sun and narrows down the Moon.

Usage:
  python build_quiz.py site/data/quiz.json                 # download
  python build_quiz.py site/data/quiz.json --csv ogdb.csv  # local file
"""
import argparse
import csv
import io
import json
import random
import re
import sys
import urllib.request
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from astro import chart_from_time  # noqa: E402

URL = "https://opengauquelin.org/download/ogdb-time.csv.zip"
CARDS = 6000

csv.field_size_limit(10_000_000)


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": "astro-trends (github.com/ErinRightMeow/astro_data)"})
    with urllib.request.urlopen(req, timeout=300) as res:
        blob = res.read()
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
        return z.read(name).decode("utf-8-sig")


def read_rows(text):
    first = text.split("\n", 1)[0]
    delim = ";" if first.count(";") > first.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
    # Column names vary a little between exports; match them loosely.
    reader.fieldnames = [f.strip().upper() for f in reader.fieldnames]
    return reader


def parse_offset(text):
    """'+01:00', '-00:09:21' or '+0.5' -> hours east of UTC."""
    text = (text or "").strip()
    m = re.fullmatch(r"([+-])?(\d{1,2}):(\d{2})(?::(\d{2}))?", text)
    if m:
        h = int(m[2]) + int(m[3]) / 60 + int(m[4] or 0) / 3600
        return -h if m[1] == "-" else h
    return float(text)


def parse_dt(text):
    text = text.strip().replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            pass
    raise ValueError(text)


def birth_utc(row):
    """Birth moment in UTC, from DATE-UT or from DATE and TZO."""
    if row.get("DATE-UT"):
        return parse_dt(row["DATE-UT"]).replace(tzinfo=timezone.utc)
    local = parse_dt(row["DATE"])
    return (local - timedelta(hours=parse_offset(row["TZO"]))).replace(tzinfo=timezone.utc)


def occupation_label(code):
    return code.strip().replace("-", " ").capitalize()


def card(row):
    """One deck entry, or None if the record can't be used."""
    try:
        dt = birth_utc(row)
        lat, lon = float(row["LAT"]), float(row["LG"])
    except (KeyError, ValueError, TypeError):
        return None
    if not (-66 < lat < 66) or not (-180 <= lon <= 180):
        return None  # the Ascendant misbehaves near the poles
    occs = [occupation_label(o) for o in (row.get("OCCU") or "").split("+") if o.strip()]
    if not occs:
        return None
    chart = chart_from_time(dt, lat, lon)
    name = " ".join(x for x in (row.get("GNAME", "").strip(), row.get("FNAME", "").strip().title()) if x)
    return {
        "id": (row.get("OGID") or row.get("SLUG") or "").strip(),
        "name": name or (row.get("FAME") or "").strip(),
        "occ": " / ".join(occs),
        "cy": (row.get("CY") or "").strip(),
        "sex": (row.get("G") or "").strip().upper()[:1],
        "year": dt.year,
        "lat": round(lat),
        "asc": chart["asc"],
        "moon": chart["signs"]["Moon"],
        "sun": chart["signs"]["Sun"],
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out")
    ap.add_argument("--csv", help="read a local Open Gauquelin CSV instead of downloading")
    ap.add_argument("--cards", type=int, default=CARDS)
    args = ap.parse_args()

    text = Path(args.csv).read_text(encoding="utf-8-sig") if args.csv else download(URL)
    reader = read_rows(text)
    print("Columns:", reader.fieldnames, file=sys.stderr)
    rows = list(reader)
    for r in rows[:3]:
        print("Sample:", {k: r.get(k) for k in ("OGID", "DATE", "TZO", "DATE-UT", "LAT", "LG", "CY", "OCCU")}, file=sys.stderr)

    # Sample before computing charts: a fixed seed keeps the deck stable
    # between rebuilds so players' scores stay comparable.
    random.Random(1955).shuffle(rows)
    cards, skipped = [], 0
    for r in rows:
        c = card(r)
        if c is None:
            skipped += 1
            continue
        cards.append(c)
        if len(cards) >= args.cards:
            break
    if not cards:
        sys.exit("No usable records: check the column names printed above.")
    print(f"{len(rows)} records, {skipped} skipped, {len(cards)} cards.", file=sys.stderr)

    keys = list(cards[0])
    out = {
        "meta": {
            "source": "Open Gauquelin Database (CC BY-SA 4.0)",
            "url": "https://opengauquelin.org",
            "built": date.today().isoformat(),
            "records": len(rows),
        },
        "keys": keys,
        "cards": [[c[k] for k in keys] for c in cards],
    }
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
