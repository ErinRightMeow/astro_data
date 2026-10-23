"""Turn a CSV of birth records into the small JSON file the website reads.

Input columns: id, birth_date (YYYY-MM-DD), birth_time (local HH:MM, may be
blank), utc_offset (hours, may be blank), lat, lon, country, categories
(labels separated by "|").

For every (category, feature) pair and each data split the output holds the
observed count, the count expected by chance and its variance. "Chance" is
the feature's share among everyone else in the dataset (people outside the
category) born in the same year and country, so slow planets (which mark
birth years) and national birth patterns don't masquerade as astrology.

People are split once and for all by a hash of their id: 70% "explore",
30% "confirm". The site lets visitors explore freely and then re-check a
finding on the confirm data they haven't seen.
"""
import argparse
import csv
import hashlib
import json
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from multiprocessing import Pool
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from astro import chart_from_date, chart_from_time, parse_date  # noqa: E402
from features import build_catalog, chart_features  # noqa: E402

SPLITS = ["explore", "confirm"]
TOP_COUNTRIES = 12


def _float(text):
    return float(text) if text not in (None, "") else None


def compute(row):
    """(feature ids, known group ids) for one CSV row, or None if unusable."""
    try:
        d = parse_date(row["birth_date"])
        lat, lon = _float(row.get("lat")), _float(row.get("lon"))
        offset = _float(row.get("utc_offset"))
        if row.get("birth_time") and lat is not None and lon is not None and offset is not None:
            hh, mm = (int(x) for x in row["birth_time"].split(":")[:2])
            local = datetime(d.year, d.month, d.day, hh, mm, tzinfo=timezone.utc)
            chart = chart_from_time(local - timedelta(hours=offset), lat, lon)
        else:
            chart = chart_from_date(d, lon)
    except (ValueError, KeyError):
        return None
    return chart_features(chart)


def split_of(person_id):
    h = int(hashlib.sha1(person_id.encode()).hexdigest(), 16)
    return 0 if h % 10 < 7 else 1


def aggregate(rows, results, min_category):
    features, groups = build_catalog()
    f_index = {f["id"]: i for i, f in enumerate(features)}
    g_index = {g["id"]: i for i, g in enumerate(groups)}
    f_group = np.array([g_index[f["group"]] for f in features])

    kept = [(r, res) for r, res in zip(rows, results) if res is not None]
    cat_counts = Counter(c for r, _ in kept for c in r["categories"])
    categories = sorted(c for c, n in cat_counts.items() if n >= min_category)
    c_index = {c: i for i, c in enumerate(categories)}

    countries = Counter(r["country"] or "Unknown" for r, _ in kept)
    top = [c for c, _ in countries.most_common(TOP_COUNTRIES) if c != "Unknown"]
    # Strata are birth year x country. Coarser strata (decades) let slow
    # planets stand in for "born late or early in the decade", which tracks
    # how occupations change over time rather than anything astrological.
    years = sorted({int(r["birth_date"][:4]) for r, _ in kept})
    strata = [f"{y} {c}" for y in years for c in top + ["Other"]]
    s_index = {s: i for i, s in enumerate(strata)}

    S, F, G, C = len(strata), len(features), len(groups), len(categories)
    allf = np.zeros((2, S, F))
    allg = np.zeros((2, S, G))
    cav = np.zeros((2, C, S, G))
    cf = np.zeros((2, C, S, F))

    for row, (feats, known) in kept:
        sp = split_of(row["id"])
        country = row["country"] if row["country"] in top else "Other"
        s = s_index[f"{int(row['birth_date'][:4])} {country}"]
        fi = np.array([f_index[f] for f in feats], dtype=int)
        gi = np.array([g_index[g] for g in known], dtype=int)
        allf[sp, s, fi] += 1
        allg[sp, s, gi] += 1
        for c in row["categories"]:
            if c in c_index:
                cav[sp, c_index[c], s, gi] += 1
                cf[sp, c_index[c], s, fi] += 1

    out_splits = {}
    for sp, name in enumerate(SPLITS):
        known_cf = cav[sp][:, :, f_group]                  # C x S x F
        ref_n = allg[sp][None, :, f_group] - known_cf      # everyone else
        ref_f = allf[sp][None] - cf[sp]
        p = np.divide(ref_f, ref_n, out=np.zeros_like(ref_n), where=ref_n > 0)
        usable = np.where(ref_n > 0, known_cf, 0)
        expected = (usable * p).sum(axis=1)
        # Binomial variance of the group, inflated because the reference
        # share is itself estimated from a finite sample.
        inflate = 1 + np.divide(usable, ref_n, out=np.zeros_like(ref_n), where=ref_n > 0)
        variance = (usable * p * (1 - p) * inflate).sum(axis=1)
        observed = (np.where(ref_n > 0, cf[sp], 0)).sum(axis=1)
        n_known = cav[sp].sum(axis=1)                      # C x G
        total_f = allf[sp].sum(axis=0)
        total_g = allg[sp].sum(axis=0)
        out_splits[name] = {
            "observed": observed.astype(int).tolist(),
            "expected": np.round(expected, 2).tolist(),
            "variance": np.round(variance, 2).tolist(),
            "known": n_known.astype(int).tolist(),
            "baseShare": np.round(np.divide(total_f, total_g[f_group],
                                            out=np.zeros(F), where=total_g[f_group] > 0), 5).tolist(),
            "people": int(sum(1 for r, _ in kept if split_of(r["id"]) == sp)),
        }
    return {
        "features": features,
        "groups": groups,
        "categories": [{"label": c, "n": cat_counts[c]} for c in categories],
        "strata": strata,
        "people": len(kept),
        "skipped": len(rows) - len(kept),
        "splits": out_splits,
    }


def read_rows(path):
    with open(path, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    for r in rows:
        r["categories"] = [c for c in (r.get("categories") or "").split("|") if c]
        r["country"] = r.get("country") or ""
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("csv")
    ap.add_argument("out")
    ap.add_argument("--name", required=True, help="Dataset name shown on the site")
    ap.add_argument("--description", default="")
    ap.add_argument("--source", default="", help="Source and license line")
    ap.add_argument("--demo", action="store_true", help="Mark as fake demo data")
    ap.add_argument("--min-category", type=int, default=100)
    ap.add_argument("--workers", type=int, default=None)
    ap.add_argument("--register", metavar="DATASETS_JSON",
                    help="Add or update this dataset in the site's dataset list")
    args = ap.parse_args()

    rows = read_rows(args.csv)
    with Pool(args.workers) as pool:
        results = pool.map(compute, rows, chunksize=500)
    data = aggregate(rows, results, args.min_category)
    data["meta"] = {"name": args.name, "description": args.description,
                    "source": args.source, "demo": args.demo,
                    "built": datetime.now(timezone.utc).strftime("%Y-%m-%d")}
    Path(args.out).write_text(json.dumps(data, separators=(",", ":")))
    if args.register:
        reg = Path(args.register)
        entries = json.loads(reg.read_text()) if reg.exists() else []
        entries = [e for e in entries if e["file"] != Path(args.out).name]
        entries.insert(0 if not args.demo else len(entries), {"file": Path(args.out).name, "name": args.name})
        reg.write_text(json.dumps(entries, indent=2) + "\n")
    print(f"{data['people']} people, {len(data['categories'])} categories, "
          f"{data['skipped']} skipped -> {args.out}")


if __name__ == "__main__":
    main()
