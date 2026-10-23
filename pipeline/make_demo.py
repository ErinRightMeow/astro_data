"""Write a fake dataset for developing and testing the site.

Everything here is random. One built-in pattern exists so the site has
something to find: "Demo athletes" are more often born in January to March,
like the real "relative age effect" in youth sports. It shows up as a Sun
sign result even though it comes from school cut-off dates, not the sky.
"""
import csv
import random
import sys
from datetime import date, timedelta

COUNTRIES = [("US", 39, -98), ("FR", 46, 2), ("DE", 51, 10), ("GB", 54, -2),
             ("IT", 42, 12), ("BR", -10, -52), ("JP", 36, 138), ("IN", 21, 78)]
GROUPS = ["Demo athletes", "Demo writers", "Demo scientists", "Demo musicians",
          "Demo politicians", "Demo painters"]


def main(out, n=20000, seed=7):
    rng = random.Random(seed)
    start, span = date(1900, 1, 1), (date(2000, 12, 31) - date(1900, 1, 1)).days
    with open(out, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "birth_date", "birth_time", "utc_offset", "lat", "lon",
                    "country", "categories"])
        for i in range(n):
            group = rng.choice(GROUPS)
            d = start + timedelta(days=rng.randrange(span))
            if group == "Demo athletes" and rng.random() < 0.25:
                d = date(d.year, rng.randint(1, 3), rng.randint(1, 28))
            country, lat, lon = rng.choice(COUNTRIES)
            w.writerow([f"demo{i}", d.isoformat(), "", "", lat, lon, country, group])


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 20000)
