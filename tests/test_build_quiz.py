import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "pipeline"))
from build_quiz import birth_utc, card, east_sign, parse_offset, read_rows  # noqa: E402


def test_offsets():
    assert parse_offset("+01:00") == 1
    assert parse_offset("-05:00") == -5
    assert abs(parse_offset("+00:09:21") - (9 / 60 + 21 / 3600)) < 1e-9
    assert parse_offset("0.5") == 0.5


def test_birth_time_in_utc():
    # Paris mean time was 9 min 21 s ahead of Greenwich.
    assert birth_utc({"DATE": "1900-01-01 00:09:21", "TZO": "+00:09:21"}) == datetime(1900, 1, 1, tzinfo=timezone.utc)
    assert birth_utc({"DATE-UT": "1931-04-07 10:00"}) == datetime(1931, 4, 7, 10, tzinfo=timezone.utc)


def test_card_from_semicolon_csv():
    text = "OGID;FNAME;GNAME;DATE;TZO;LG;LAT;CY;G;OCCU\nlacaus-roger-1931-04-07;LACAUS;Roger;1931-04-07 10:00;+00:00;2.35;43.2;FR;M;rugby-player\n"
    row = next(iter(read_rows(text)))
    c = card(row)
    assert c["name"] == "Roger Lacaus"
    assert c["occ"] == "Rugby player"
    assert c["sun"] == "Aries"
    assert c["year"] == 1931
    assert "day" not in c and "month" not in c


def test_unusable_rows_are_skipped():
    assert card({"DATE": "", "TZO": "", "LG": "2", "LAT": "48", "OCCU": "painter"}) is None
    assert card({"DATE-UT": "1900-01-01 00:00", "LG": "2", "LAT": "48", "OCCU": ""}) is None


def test_west_positive_longitudes_are_detected():
    paris_west = [{"CY": "FR", "LG": "-2.34"}, {"CY": "FR", "LG": "-5.4"}, {"CY": "FR", "LG": "4.5"}]
    assert east_sign(paris_west) == -1
    assert east_sign([{"CY": "FR", "LG": "2.34"}]) == 1
    assert east_sign([{"CY": "US", "LG": "-74"}]) == 1
