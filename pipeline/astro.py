"""Chart computation with Astronomy Engine (MIT license).

Two entry points:
- chart_from_date: birth date only. Returns only the factors that are the
  same for the whole local day of birth (a fast Moon is often unknown).
- chart_from_time: exact birth time and place. Adds Ascendant and houses.
"""
import math
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache

import astronomy

PLANETS = ["Sun", "Moon", "Mercury", "Venus", "Mars",
           "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]
SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra",
         "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"]
# Major aspects and the orb (degrees) allowed for each.
ASPECTS = [("conjunction", 0, 8), ("sextile", 60, 4), ("square", 90, 7),
           ("trine", 120, 7), ("opposition", 180, 8)]
PAIRS = [(PLANETS[i], PLANETS[j])
         for i in range(len(PLANETS)) for j in range(i + 1, len(PLANETS))]

_EPOCH = datetime(2000, 1, 1, tzinfo=timezone.utc)


def _time(dt):
    dt = dt.astimezone(timezone.utc)
    return astronomy.Time.Make(dt.year, dt.month, dt.day, dt.hour, dt.minute,
                               dt.second + dt.microsecond / 1e6)


def longitudes_exact(dt):
    """Geocentric true ecliptic longitude of date for each planet, degrees."""
    t = _time(dt)
    out = {}
    for name in PLANETS:
        if name == "Sun":
            out[name] = astronomy.SunPosition(t).elon
        elif name == "Moon":
            out[name] = astronomy.EclipticGeoMoon(t).lon
        else:
            vec = astronomy.GeoVector(getattr(astronomy.Body, name), t, True)
            out[name] = astronomy.Ecliptic(vec).elon
    return out


@lru_cache(maxsize=20000)
def _daily(day_number):
    return longitudes_exact(_EPOCH + timedelta(days=day_number))


def longitudes(dt):
    """Fast longitudes: linear interpolation between daily 00:00 UTC values.

    Accurate to about 0.1 degree for the Moon and far better for the rest,
    which is enough for signs and aspects with multi-degree orbs.
    """
    days = (dt.astimezone(timezone.utc) - _EPOCH).total_seconds() / 86400
    d0 = math.floor(days)
    frac = days - d0
    a, b = _daily(d0), _daily(d0 + 1)
    out = {}
    for name in PLANETS:
        delta = (b[name] - a[name] + 180) % 360 - 180
        out[name] = (a[name] + frac * delta) % 360
    return out


def sign_of(lon):
    return SIGNS[int(lon // 30) % 12]


def aspect_between(lon1, lon2):
    """Name of the major aspect between two longitudes, or 'none'."""
    sep = abs(lon1 - lon2) % 360
    sep = min(sep, 360 - sep)
    for name, angle, orb in ASPECTS:
        if abs(sep - angle) <= orb:
            return name
    return "none"


def _factors(lons):
    signs = {p: sign_of(lons[p]) for p in PLANETS}
    aspects = {f"{a}-{b}": aspect_between(lons[a], lons[b]) for a, b in PAIRS}
    return signs, aspects


def chart_from_date(birth_date, lon=None, samples=5):
    """Factors that hold for the whole local day of birth.

    The local day is placed in UTC from the birth longitude when known
    (lon / 15 hours, plus 2 hours of slack for time zones); otherwise every
    time zone on Earth is allowed (UTC-12 to UTC+14).
    """
    midnight = datetime(birth_date.year, birth_date.month, birth_date.day,
                        tzinfo=timezone.utc)
    if lon is None:
        start = midnight - timedelta(hours=14)
        end = midnight + timedelta(hours=36)
    else:
        offset = timedelta(hours=lon / 15)
        start = midnight - offset - timedelta(hours=2)
        end = midnight - offset + timedelta(hours=26)

    step = (end - start) / (samples - 1)
    states = [_factors(longitudes(start + i * step)) for i in range(samples)]
    signs = {p: states[0][0][p] for p in PLANETS
             if all(s[0][p] == states[0][0][p] for s in states)}
    aspects = {k: states[0][1][k] for k in states[0][1]
               if all(s[1][k] == states[0][1][k] for s in states)}
    return {"signs": signs, "aspects": aspects}


def _obliquity(dt):
    centuries = (dt - _EPOCH).total_seconds() / 86400 / 36525
    return 23.4392911 - 0.0130042 * centuries


def ascendant(dt, lat, lon):
    """Ecliptic longitude of the Ascendant, degrees."""
    ramc = math.radians((astronomy.SiderealTime(_time(dt)) * 15 + lon) % 360)
    eps = math.radians(_obliquity(dt))
    phi = math.radians(lat)
    asc = math.atan2(math.cos(ramc),
                     -(math.sin(ramc) * math.cos(eps) + math.tan(phi) * math.sin(eps)))
    return math.degrees(asc) % 360


def chart_from_time(dt, lat, lon):
    """Full chart for an exact UTC datetime and birth place.

    Houses are whole-sign houses counted from the Ascendant's sign.
    """
    lons = longitudes_exact(dt)
    signs, aspects = _factors(lons)
    asc_sign = SIGNS.index(sign_of(ascendant(dt, lat, lon)))
    houses = {p: (SIGNS.index(signs[p]) - asc_sign) % 12 + 1 for p in PLANETS}
    return {"signs": signs, "aspects": aspects, "asc": SIGNS[asc_sign],
            "houses": houses}


def parse_date(text):
    return date.fromisoformat(text)
