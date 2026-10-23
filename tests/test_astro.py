import sys
from datetime import date, datetime, timezone
from pathlib import Path

import astronomy

sys.path.insert(0, str(Path(__file__).parent.parent / "pipeline"))
from astro import (aspect_between, ascendant, chart_from_date,  # noqa: E402
                   chart_from_time, longitudes, longitudes_exact, sign_of)
from features import build_catalog, chart_features  # noqa: E402

J2000 = datetime(2000, 1, 1, 12, tzinfo=timezone.utc)


def test_known_positions_at_j2000():
    lons = longitudes_exact(J2000)
    # Published values for 2000-01-01 12:00 UTC.
    assert abs(lons["Sun"] - 280.37) < 0.05
    assert abs(lons["Moon"] - 223.32) < 0.05
    assert abs(lons["Mars"] - 327.96) < 0.05
    assert sign_of(lons["Sun"]) == "Capricorn"
    assert sign_of(lons["Moon"]) == "Scorpio"


def test_interpolation_close_to_exact():
    for dt in [datetime(1955, 6, 3, 17, 40, tzinfo=timezone.utc),
               datetime(1987, 11, 21, 4, 5, tzinfo=timezone.utc)]:
        fast, exact = longitudes(dt), longitudes_exact(dt)
        for name in fast:
            diff = abs((fast[name] - exact[name] + 180) % 360 - 180)
            assert diff < 0.2, (name, diff)


def test_ascendant_matches_sun_at_sunrise():
    # When the Sun's centre is geometrically on the eastern horizon it sits on
    # the Ascendant (the Sun is always on the ecliptic).
    for lat, lon in [(48.85, 2.35), (40.71, -74.0), (-33.87, 151.2), (64.1, -21.9)]:
        obs = astronomy.Observer(lat, lon, 0)
        t = astronomy.SearchAltitude(astronomy.Body.Sun, obs, astronomy.Direction.Rise,
                                     astronomy.Time.Make(2021, 3, 1, 0, 0, 0), 2, 0.0)
        dt = t.Utc().replace(tzinfo=timezone.utc)
        sun = longitudes_exact(dt)["Sun"]
        diff = abs((ascendant(dt, lat, lon) - sun + 180) % 360 - 180)
        assert diff < 0.1, (lat, lon, diff)


def test_aspects():
    assert aspect_between(10, 15) == "conjunction"
    assert aspect_between(355, 3) == "conjunction"
    assert aspect_between(0, 92) == "square"
    assert aspect_between(0, 175) == "opposition"
    assert aspect_between(0, 40) == "none"


def test_date_only_chart_drops_uncertain_factors():
    chart = chart_from_date(date(2000, 1, 1), lon=2.35)
    assert chart["signs"]["Sun"] == "Capricorn"
    assert chart["signs"]["Pluto"] == "Sagittarius"
    # Sun entered Aries on 2000-03-20 around 07:35 UTC, so that day is unknown.
    assert "Sun" not in chart_from_date(date(2000, 3, 20), lon=0)["signs"]
    # With no location the window is wider, so fewer factors are known.
    wide = chart_from_date(date(2000, 1, 1))
    assert set(wide["signs"]) <= set(chart["signs"])


def test_full_chart_features_are_in_catalog():
    ids = {f["id"] for f in build_catalog()[0]}
    chart = chart_from_time(J2000, 48.85, 2.35)
    feats, known = chart_features(chart)
    assert set(feats) <= ids
    assert "asc" in known and len([g for g in known if g.startswith("house:")]) == 10


def test_occupation_rules():
    from fetch_wikidata import categorize, load_rules
    rules = load_rules(Path(__file__).parent.parent / "pipeline" / "occupations.json")
    assert categorize(["association football player"], rules) == ["Athletes"]
    assert categorize(["chess player"], rules) == []
    assert categorize(["attorney general", "politician"], rules) == ["Politicians"]
    assert categorize(["film actor", "singer"], rules) == ["Actors", "Musicians"]
    assert categorize(["general practitioner"], rules) == []
