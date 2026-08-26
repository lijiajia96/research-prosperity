#!/usr/bin/env python3
"""Add a reproducible public-attention proxy to the existing annual dataset.

The first release uses annual user pageviews for one canonical English Wikipedia
article per comparison unit. Scores are normalized as each unit's share of its
comparison scope, then indexed to the unit's 2016-2019 mean (=100). This keeps
the series comparable through Wikipedia's overall traffic changes without
pretending that a single open channel is a complete measure of social attention.
"""

from __future__ import annotations

import json
import math
import statistics
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATHS = (ROOT / "app/data/openalex.json", ROOT / "public/data/openalex.json")
AS_OF = "2026-08-26"
START_YEAR = 2016
BASELINE_YEARS = range(2016, 2020)
SEASON_YEARS = (2019, 2022, 2023, 2024, 2025)
CACHE = ROOT / ".cache/social-attention-wikipedia"

# Canonical pages are deliberately fixed and versioned, just like the journal
# pools. They are a transparent proxy, not a dynamically changing search result.
ARTICLE_TITLES = {
    11: "Agricultural science", 12: "Humanities", 13: "Molecular biology",
    14: "Business administration", 15: "Chemical engineering", 16: "Chemistry",
    17: "Computer science", 18: "Decision theory", 19: "Earth science",
    20: "Economics", 21: "Energy", 22: "Engineering",
    23: "Environmental science", 24: "Immunology", 25: "Materials science",
    26: "Mathematics", 27: "Medicine", 28: "Neuroscience", 29: "Nursing",
    30: "Pharmacology", 31: "Physics", 32: "Psychology", 33: "Social science",
    34: "Veterinary medicine", 35: "Dentistry", 36: "Allied health professions",
    2200: "Engineering", 2202: "Aerospace engineering", 2203: "Automotive engineering",
    2204: "Biomedical engineering", 2205: "Structural engineering",
    2206: "Computational mechanics", 2207: "Control engineering",
    2208: "Electrical engineering", 2209: "Industrial engineering",
    2210: "Mechanical engineering", 2211: "Strength of materials",
    2212: "Marine engineering", 2213: "Safety engineering", 2214: "Media technology",
    2215: "Construction", 2216: "Architecture",
    1702: "Artificial intelligence", 1703: "Theory of computation",
    1704: "Computer graphics", 1705: "Computer network", 1706: "Applied computer science",
    1707: "Computer vision", 1708: "Computer architecture",
    1709: "Human–computer interaction", 1710: "Information system",
    1711: "Signal processing", 1712: "Software engineering",
}


def fetch_json(url: str):
    last_error = None
    for attempt in range(6):
        try:
            request = urllib.request.Request(
                url,
                headers={"User-Agent": "research-prosperity-pulse/1.0 (public research dashboard)"},
            )
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            time.sleep(min(10, 1.5 * (attempt + 1)))
    raise RuntimeError(f"Unable to fetch {url}") from last_error


def pageviews(title: str):
    CACHE.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE / f"{urllib.parse.quote(title, safe='')}.json"
    if cache_path.exists():
        return json.loads(cache_path.read_text())
    article = urllib.parse.quote(title.replace(" ", "_"), safe="")
    url = (
        "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
        f"en.wikipedia/all-access/user/{article}/monthly/2016010100/2026082600"
    )
    payload = fetch_json(url)
    annual = {year: 0 for year in range(START_YEAR, 2027)}
    monthly = {year: {} for year in range(START_YEAR, 2027)}
    for item in payload.get("items", []):
        year = int(item["timestamp"][:4])
        month = int(item["timestamp"][4:6])
        if year in annual:
            views = int(item["views"])
            annual[year] += views
            monthly[year][month] = views
    fractions = []
    for year in SEASON_YEARS:
        full = annual[year]
        through_august = sum(v for month, v in monthly[year].items() if month <= 8)
        if full:
            fractions.append(through_august / full)
    season_fraction = statistics.median(fractions) if fractions else 8 / 12
    result = {
        "annual": annual,
        "seasonFraction": season_fraction,
        "url": f"https://en.wikipedia.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}",
    }
    cache_path.write_text(json.dumps(result, ensure_ascii=False))
    return result


def percentile(values, value):
    valid = sorted(v for v in values if v is not None and math.isfinite(v))
    if len(valid) < 2:
        return 50.0
    below = sum(v < value for v in valid)
    equal = sum(v == value for v in valid)
    return 100 * (below + 0.5 * equal) / len(valid)


def enrich_scope(units):
    histories = {}
    for index, unit in enumerate(units, start=1):
        title = ARTICLE_TITLES[unit["id"]]
        history = pageviews(title)
        histories[unit["id"]] = history
        unit["socialSource"] = {
            "provider": "Wikimedia Pageviews",
            "article": title,
            "url": history["url"],
            "language": "en",
            "coverage": "single_open_channel",
            "confidence": "C",
        }
        print(f"[{index:02d}/{len(units):02d}] {unit['name']} -> {title}", flush=True)

    shares = {unit["id"]: {} for unit in units}
    adjusted = {unit["id"]: {} for unit in units}
    for year in range(START_YEAR, 2027):
        for unit in units:
            history = histories[unit["id"]]
            actual = int(history["annual"].get(str(year), history["annual"].get(year, 0)))
            forecast = round(actual / history["seasonFraction"]) if year == 2026 else actual
            adjusted[unit["id"]][year] = forecast
        total = sum(adjusted[unit["id"]][year] for unit in units)
        for unit in units:
            shares[unit["id"]][year] = adjusted[unit["id"]][year] / total if total else None

    indices = {unit["id"]: {} for unit in units}
    for unit in units:
        unit_shares = shares[unit["id"]]
        baseline = statistics.mean(unit_shares[year] for year in BASELINE_YEARS if unit_shares[year] is not None)
        for year in range(START_YEAR, 2027):
            share = unit_shares[year]
            indices[unit["id"]][year] = 100 * share / baseline if share is not None and baseline else None

    for year in range(START_YEAR, 2027):
        year_indices = [indices[unit["id"]][year] for unit in units]
        for unit in units:
            metric = next(row for row in unit["metrics"] if row["year"] == year)
            history = histories[unit["id"]]
            actual = int(history["annual"].get(str(year), history["annual"].get(year, 0)))
            index = indices[unit["id"]][year]
            share = shares[unit["id"]][year]
            previous_share = shares[unit["id"]].get(year - 1)
            past_share = shares[unit["id"]].get(year - 5)
            social_score = percentile(year_indices, index) if index is not None else None
            metric.update({
                "socialViews": actual,
                "socialForecastViews": adjusted[unit["id"]][year],
                "socialShare": round(share, 8) if share is not None else None,
                "socialAttentionIndex": round(index, 1) if index is not None else None,
                "socialScore": round(social_score, 1) if social_score is not None else None,
                "socialYoyGrowth": round(share / previous_share - 1, 4) if share and previous_share else None,
                "socialCagr5": round((share / past_share) ** 0.2 - 1, 4) if share and past_share else None,
                "attentionGap": round(social_score - metric["prosperityScore"], 1)
                if social_score is not None and metric.get("prosperityScore") is not None else None,
            })


def main():
    data = json.loads(DATA_PATHS[0].read_text())
    for key in ("fields", "engineeringSubfields", "computerScienceSubfields"):
        enrich_scope(data[key])
    data["meta"]["socialAttention"] = {
        "status": "experimental",
        "startYear": START_YEAR,
        "baseline": "2016-2019=100",
        "asOf": AS_OF,
        "source": "Wikimedia Pageviews API",
        "sourceUrl": "https://wikimedia.org/api/rest_v1/#/Pageviews%20data",
        "scope": "English Wikipedia user pageviews for a fixed canonical article per unit",
        "confidence": "C",
        "note": "A reproducible public-knowledge attention proxy, not a complete social-attention measure.",
    }
    data["meta"]["methodVersion"] = "v1.3"
    rendered = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    for path in DATA_PATHS:
        path.write_text(rendered)
    print("Social-attention data written to app and public datasets.", flush=True)


if __name__ == "__main__":
    main()
