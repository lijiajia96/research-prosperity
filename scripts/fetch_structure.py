#!/usr/bin/env python3
"""Enrich the static dataset with 2025 geographic and institutional structure.

The aggregation uses all 2025 journal articles in OpenAlex Core sources for each
field/subfield. Country counts are work-level affiliations (a work can count for
more than one country); institution counts are likewise non-exclusive.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "openalex-structure-2025"
API = "https://api.openalex.org/works"
YEAR = 2025


def request_groups(filters: str, group_by: str):
    params = urllib.parse.urlencode({"filter": filters, "group_by": group_by, "per_page": 200})
    url = f"{API}?{params}"
    last_error = None
    for attempt in range(8):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "research-prosperity-mvp/1.5"})
            with urllib.request.urlopen(req, timeout=45) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code == 429:
                time.sleep(min(45, 4 * (attempt + 1)))
                continue
            raise
        except Exception as exc:
            last_error = exc
            time.sleep(min(12, 1.5 * (attempt + 1)))
    raise RuntimeError(f"OpenAlex request failed: {url}") from last_error


def hhi(rows):
    total = sum(row["count"] for row in rows)
    return sum((row["count"] / total) ** 2 for row in rows) if total else None


def fetch_unit(unit):
    unit_id = int(unit["id"])
    cache_path = CACHE / f"{unit_id}.json"
    if cache_path.exists():
        return unit_id, json.loads(cache_path.read_text(encoding="utf-8"))

    level = unit.get("level", "field")
    filters = (
        f"primary_topic.{level}.id:{unit_id},type:article,"
        f"primary_location.source.is_core:true,"
        f"from_publication_date:{YEAR}-01-01,to_publication_date:{YEAR}-12-31"
    )
    country_payload = request_groups(filters, "authorships.institutions.country_code")
    institution_payload = request_groups(filters, "authorships.institutions.id")
    work_count = int(country_payload.get("meta", {}).get("count", 0))

    def normalize(payload, code=False):
        rows = []
        for row in payload.get("group_by", []):
            key = str(row.get("key", "")).split("/")[-1]
            rows.append({
                "code" if code else "id": key,
                "name": row.get("key_display_name") or key,
                "count": int(row.get("count", 0)),
            })
        return rows

    countries = normalize(country_payload, code=True)
    institutions = normalize(institution_payload)
    country_mentions = sum(row["count"] for row in countries)
    institution_mentions = sum(row["count"] for row in institutions)
    structure = {
        "year": YEAR,
        "workCount": work_count,
        "countryAffiliationMentions": country_mentions,
        "institutionAffiliationMentionsTop200": institution_mentions,
        "meanCountriesPerWork": round(country_mentions / work_count, 3) if work_count else None,
        "countryEffectiveNumber": round(1 / hhi(countries), 1) if hhi(countries) else None,
        "institutionEffectiveNumberTop200": round(1 / hhi(institutions), 1) if hhi(institutions) else None,
        "top5CountryShare": round(sum(r["count"] for r in countries[:5]) / country_mentions, 4) if country_mentions else None,
        "top5InstitutionShareTop200": round(sum(r["count"] for r in institutions[:5]) / institution_mentions, 4) if institution_mentions else None,
        "topCountries": [
            {**row, "share": round(row["count"] / country_mentions, 4) if country_mentions else None}
            for row in countries[:8]
        ],
        "topInstitutions": [
            {**row, "shareTop200": round(row["count"] / institution_mentions, 4) if institution_mentions else None}
            for row in institutions[:8]
        ],
        "status": "complete_2025_snapshot",
        "source": "OpenAlex",
        "sourceUrl": "https://docs.openalex.org/api-entities/works/group-works",
        "note": "Counts are non-exclusive affiliation mentions. A multi-country or multi-institution work contributes once to each represented group.",
    }
    cache_path.write_text(json.dumps(structure, ensure_ascii=False), encoding="utf-8")
    return unit_id, structure


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    data_path = ROOT / "app" / "data" / "openalex.json"
    payload = json.loads(data_path.read_text(encoding="utf-8"))
    sections = ("fields", "engineeringSubfields", "computerScienceSubfields")
    units = [unit for section in sections for unit in payload[section]]
    structures = {}

    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(fetch_unit, unit): unit for unit in units}
        for future in as_completed(futures):
            unit_id, structure = future.result()
            structures[unit_id] = structure
            print(f"structured {unit_id}", flush=True)

    for section in sections:
        for unit in payload[section]:
            unit["structure"] = structures[int(unit["id"])]

    payload["meta"]["methodVersion"] = "v1.5"
    payload["meta"]["structure"] = {
        "status": "complete_2025_snapshot",
        "year": YEAR,
        "source": "OpenAlex",
        "sourceUrl": "https://docs.openalex.org/api-entities/works/group-works",
        "scope": "All journal articles in OpenAlex Core sources, grouped by primary topic field/subfield",
        "note": "Country and institution counts are non-exclusive affiliation mentions; institution concentration uses the top 200 groups returned by OpenAlex.",
    }

    compact = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    data_path.write_text(compact, encoding="utf-8")
    public_path = ROOT / "public" / "data" / "openalex.json"
    public_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {data_path} and {public_path}")


if __name__ == "__main__":
    main()
