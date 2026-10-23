"""Download people with exact (day-precision) birth dates from Wikidata.

Wikidata is CC0 (public domain). We keep only what the site needs: birth
date, sex, country of citizenship, birthplace coordinates and occupations.
No names are stored.

Queries go to the QLever Wikidata endpoint by default because it returns
hundreds of thousands of rows per query; the official query service times
out on queries this large. Run one decade per query.

Usage: python fetch_wikidata.py out.csv --start 1850 --end 2005
"""
import argparse
import csv
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ENDPOINT = "https://qlever.cs.uni-freiburg.de/api/wikidata"
FEMALE, MALE = "http://www.wikidata.org/entity/Q6581072", "http://www.wikidata.org/entity/Q6581097"

QUERY = """
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX psv: <http://www.wikidata.org/prop/statement/value/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?person (COUNT(DISTINCT ?dob) AS ?dates) (SAMPLE(?dob) AS ?birth)
       (SAMPLE(?sex) AS ?gender) (SAMPLE(?cc) AS ?country) (SAMPLE(?coord) AS ?place)
       (GROUP_CONCAT(DISTINCT ?occLabel; SEPARATOR="|") AS ?occupations)
WHERE {
  ?person wdt:P31 wd:Q5 ;
          p:P569/psv:P569 ?tv .
  ?tv wikibase:timeValue ?dob ;
      wikibase:timePrecision ?prec .
  FILTER(?prec = 11)
  FILTER(?dob >= "%(start)s-01-01T00:00:00Z"^^xsd:dateTime && ?dob < "%(end)s-01-01T00:00:00Z"^^xsd:dateTime)
  ?person wdt:P106 ?occ .
  ?occ rdfs:label ?occLabel .
  FILTER(LANG(?occLabel) = "en")
  OPTIONAL { ?person wdt:P21 ?sex . }
  OPTIONAL { ?person wdt:P27/wdt:P297 ?cc . }
  OPTIONAL { ?person wdt:P19/wdt:P625 ?coord . }
}
GROUP BY ?person
"""

POINT = re.compile(r"Point\(([-\d.eE]+) ([-\d.eE]+)\)")


def load_rules(path):
    groups = json.loads(Path(path).read_text())["groups"]
    rules = []
    for name, g in groups.items():
        words = [re.compile(rf"\b{re.escape(w)}\b") for w in g["words"]]
        excepts = [re.compile(rf"\b{re.escape(w)}\b") for w in g.get("except", [])]
        rules.append((name, words, excepts))
    return rules


def categorize(labels, rules):
    out = set()
    for label in labels:
        label = label.lower()
        for name, words, excepts in rules:
            if any(w.search(label) for w in words) and not any(e.search(label) for e in excepts):
                out.add(name)
    return sorted(out)


def run_query(start, end, endpoint, retries=4):
    body = urllib.parse.urlencode({"query": QUERY % {"start": start, "end": end}}).encode()
    req = urllib.request.Request(endpoint, data=body, headers={
        "Accept": "text/csv",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "astro-trends research site (open-source; aggregate statistics only)",
    })
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=900) as res:
                return list(csv.DictReader(io.StringIO(res.read().decode("utf-8"))))
        except Exception as err:  # network hiccups: back off and retry
            if attempt == retries - 1:
                raise
            print(f"  retry after error: {err}", file=sys.stderr)
            time.sleep(10 * 2 ** attempt)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out")
    ap.add_argument("--start", type=int, default=1850)
    ap.add_argument("--end", type=int, default=2005)
    ap.add_argument("--endpoint", default=ENDPOINT)
    ap.add_argument("--rules", default=str(Path(__file__).with_name("occupations.json")))
    args = ap.parse_args()

    rules = load_rules(args.rules)
    kept = dropped = 0
    with open(args.out, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "birth_date", "birth_time", "utc_offset", "lat", "lon", "country", "categories"])
        for decade in range(args.start // 10 * 10, args.end, 10):
            rows = run_query(max(decade, args.start), min(decade + 10, args.end), args.endpoint)
            for r in rows:
                cats = categorize(r["occupations"].split("|"), rules)
                if r["dates"] != "1" or not cats:
                    dropped += 1  # conflicting birth dates, or no group we test
                    continue
                if r["gender"] == FEMALE:
                    cats.append("Women")
                elif r["gender"] == MALE:
                    cats.append("Men")
                m = POINT.search(r.get("place") or "")
                lon, lat = (m.group(1), m.group(2)) if m else ("", "")
                w.writerow([r["person"].rsplit("/", 1)[-1], r["birth"][:10], "", "",
                            lat, lon, r.get("country") or "", "|".join(cats)])
                kept += 1
            print(f"{decade}s: {len(rows)} rows, {kept} kept so far", file=sys.stderr)
    print(f"done: {kept} people kept, {dropped} dropped", file=sys.stderr)


if __name__ == "__main__":
    main()
