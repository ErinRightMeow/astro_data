"""The catalog of chart factors the site can test.

Each feature belongs to a group. A group is one question about a chart
("Mars's sign", "the Mars-Saturn aspect"); a person has exactly one feature
per group when that group is known for them.
"""
from astro import ASPECTS, PAIRS, PLANETS, SIGNS


def build_catalog():
    features, groups = [], []

    def group(gid, label, kind):
        groups.append({"id": gid, "label": label, "kind": kind})

    for p in PLANETS:
        gid = f"sign:{p}"
        group(gid, f"{p} sign", "sign")
        for s in SIGNS:
            features.append({"id": f"{gid}:{s}", "label": f"{p} in {s}",
                             "group": gid})
    for a, b in PAIRS:
        gid = f"aspect:{a}-{b}"
        group(gid, f"{a}-{b} aspect", "aspect")
        for name, _, _ in ASPECTS:
            features.append({"id": f"{gid}:{name}",
                             "label": f"{a} {name} {b}", "group": gid})
    group("asc", "Ascendant sign", "asc")
    for s in SIGNS:
        features.append({"id": f"asc:{s}", "label": f"{s} rising",
                         "group": "asc"})
    for p in PLANETS:
        gid = f"house:{p}"
        group(gid, f"{p} house", "house")
        for h in range(1, 13):
            features.append({"id": f"{gid}:{h}",
                             "label": f"{p} in house {h}", "group": gid})
    return features, groups


def chart_features(chart):
    """Feature ids and known group ids for one computed chart."""
    feats, known = [], []
    for p, s in chart["signs"].items():
        known.append(f"sign:{p}")
        feats.append(f"sign:{p}:{s}")
    for pair, name in chart["aspects"].items():
        known.append(f"aspect:{pair}")
        if name != "none":
            feats.append(f"aspect:{pair}:{name}")
    if "asc" in chart:
        known.append("asc")
        feats.append(f"asc:{chart['asc']}")
        for p, h in chart["houses"].items():
            known.append(f"house:{p}")
            feats.append(f"house:{p}:{h}")
    return feats, known
