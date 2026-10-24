# Astro Trends

A free website where anyone can test an astrology claim, such as "Mars in Aries people are more often athletes", against real birth data and see whether it holds up.

Each answer shows how many people have the factor, how many chance would predict, the ratio with a 95% range, and a p-value corrected for every test the visitor has run. Thirty percent of people are held back, so visitors can check a finding on data they haven't explored.

## How it fits together

1. **`pipeline/fetch_wikidata.py`** downloads people from Wikidata (CC0) who have an exact birth date and an occupation. It stores no names.
2. **`pipeline/aggregate.py`** computes each chart with [Astronomy Engine](https://github.com/cosinekitty/astronomy) (MIT). It then writes one small JSON file of observed counts, expected counts and variances for every group and chart factor.
3. **`site/`** is a static page that loads that JSON and does the statistics in the browser. It needs no server, so GitHub Pages hosts it for free.

4. **`pipeline/build_quiz.py`** builds the deck for **Guess the Chart** (`site/guess.html`), a practice game: players read about a real person and guess their rising sign, Moon sign, element, or pick their real chart out of three. Scores are compared with luck, where each guess's chance is how common that answer is in the deck (signs don't rise equally often at European latitudes). Birth days are hidden because they give away the Sun and narrow down the Moon.

The **Build data** GitHub Action runs steps 1 and 2 monthly, or on demand from the Actions tab. **Build quiz deck** refreshes the game's deck monthly. **Deploy site** publishes `site/` to GitHub Pages.

## The statistics

- **Expected counts:** each group is compared with everyone else in the dataset born in the same year and country. That keeps birth-year patterns (slow planets) and national birth seasons from looking like astrology.
- **Date-only records:** these use only the factors that were the same all day long. For example, the Moon's sign counts only if it didn't change sign that day. The Ascendant and houses need a birth time.
- **Multiple comparisons:** p-values are corrected with Benjamini-Hochberg across the visitor's session, or across a scan.
- **Small groups:** groups under 10 people are hidden.

## Run it locally

```
pip install -r requirements.txt
python pipeline/make_demo.py demo.csv            # fake data for development
python pipeline/aggregate.py demo.csv site/data/demo.json --name "Demo data (fake)" --demo --register site/data/datasets.json
cd site && python -m http.server 8000             # open http://localhost:8000
python -m pytest tests && node --test tests/*.mjs
```

## Data and licenses

- Wikidata: CC0. Results describe people notable enough for Wikidata, not the general population.
- Open Gauquelin Database: CC BY-SA 4.0. Timed birth records from French and European civil registers, collected by Michel and Françoise Gauquelin. `site/data/quiz.json` is derived from it and shares its license.
- Astro-Databank: not used. It needs written permission from Astrodienst AG.
- Occupation groups are mapped from Wikidata occupation labels in `pipeline/occupations.json`.
