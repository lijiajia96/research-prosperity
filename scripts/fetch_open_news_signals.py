#!/usr/bin/env python3
"""Add a reproducible, no-key GDELT news snapshot to the dashboard dataset.

The script samples one 15-minute GKG file at the start of each UTC hour from
00:00 through 19:00. This is a fixed 20.8% time sample of that day's GDELT stream,
not a full daily archive and not a historical series. Matching is title/URL-only
against versioned English phrases to favor precision and reproducibility.
"""

from __future__ import annotations

import html
import json
import re
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATHS = (ROOT / "app/data/openalex.json", ROOT / "public/data/openalex.json")
CACHE = ROOT / ".cache/gdelt-news-20260826"
SAMPLE_DATE = "20260826"
PAGE_TITLE = re.compile(r"<PAGE_TITLE>(.*?)</PAGE_TITLE>", re.IGNORECASE | re.DOTALL)

ALIASES = {
    11: ["agricultural science"], 12: ["arts and humanities", "the humanities"],
    13: ["molecular biology", "biochemistry and genetics"],
    14: ["business management", "business administration"],
    18: ["decision science", "decision theory"], 19: ["earth science", "planetary science"],
    20: ["economics", "econometrics"], 21: ["energy research", "energy technology"],
    22: ["engineering research", "engineering technology"],
    24: ["immunology", "microbiology"], 27: ["medical research", "medicine"],
    30: ["pharmacology", "toxicology", "pharmaceutics"],
    31: ["physics", "astronomy"], 33: ["social science"],
    36: ["allied health", "health profession"],
    2200: ["general engineering"], 2202: ["aerospace engineering"],
    2203: ["automotive engineering"], 2204: ["biomedical engineering"],
    2205: ["structural engineering", "civil engineering"],
    2206: ["computational mechanics", "finite element method"],
    2207: ["control engineering", "systems engineering"],
    2208: ["electrical engineering", "electronic engineering"],
    2209: ["industrial engineering", "manufacturing engineering"],
    2210: ["mechanical engineering"], 2211: ["mechanics of materials", "strength of materials"],
    2212: ["ocean engineering", "marine engineering"],
    2213: ["safety engineering", "reliability engineering", "risk engineering"],
    2214: ["media technology"], 2215: ["building construction", "construction technology"],
    2216: ["architecture"], 1702: ["artificial intelligence"],
    1703: ["theory of computation", "computational theory"],
    1704: ["computer graphics", "computer-aided design"],
    1705: ["computer network", "network communications"],
    1706: ["applied computer science", "computer science application"],
    1707: ["computer vision", "pattern recognition"],
    1708: ["computer architecture", "computer hardware"],
    1709: ["human-computer interaction", "human computer interaction"],
    1710: ["information systems"], 1711: ["signal processing"],
    1712: ["software engineering"],
}


def fetch(url: str, destination: Path):
    if destination.exists() and destination.stat().st_size > 1000:
        return
    last_error = None
    for attempt in range(6):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "research-prosperity-pulse/1.0"})
            with urllib.request.urlopen(request, timeout=60) as response:
                destination.write_bytes(response.read())
            return
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            time.sleep(min(12, 2 * (attempt + 1)))
    raise RuntimeError(f"Unable to download {url}") from last_error


def normalized_text(value: str):
    return re.sub(r"[^a-z0-9]+", " ", html.unescape(value).lower()).strip()


def main():
    data = json.loads(DATA_PATHS[0].read_text())
    units = data["fields"] + data["engineeringSubfields"] + data["computerScienceSubfields"]
    terms = {}
    for unit in units:
        base = unit.get("socialSource", {}).get("article", unit["nameEn"])
        terms[unit["id"]] = [normalized_text(term) for term in ALIASES.get(unit["id"], [base])]

    CACHE.mkdir(parents=True, exist_ok=True)
    matches = {unit["id"]: set() for unit in units}
    outlets = {unit["id"]: set() for unit in units}
    total_articles = set()
    sample_hours = range(20)
    for hour in sample_hours:
        timestamp = f"{SAMPLE_DATE}{hour:02d}0000"
        archive = CACHE / f"{timestamp}.gkg.csv.zip"
        url = f"https://data.gdeltproject.org/gdeltv2/{archive.name}"
        fetch(url, archive)
        with zipfile.ZipFile(archive) as bundle:
            member = bundle.namelist()[0]
            with bundle.open(member) as rows:
                for raw in rows:
                    columns = raw.decode("utf-8", "replace").rstrip("\n").split("\t")
                    if len(columns) < 27:
                        continue
                    article_url = columns[4]
                    domain = columns[3]
                    title_match = PAGE_TITLE.search(columns[26])
                    title = title_match.group(1) if title_match else ""
                    text = normalized_text(f"{title} {article_url.replace('-', ' ')}")
                    total_articles.add(article_url)
                    for unit_id, phrases in terms.items():
                        if any(phrase and phrase in text for phrase in phrases):
                            matches[unit_id].add(article_url)
                            if domain:
                                outlets[unit_id].add(domain)
        print(f"[{hour + 1:02d}/20] {timestamp}", flush=True)

    for key in ("fields", "engineeringSubfields", "computerScienceSubfields"):
        group = data[key]
        counts = {unit["id"]: len(matches[unit["id"]]) for unit in group}
        denominator = sum(counts.values())
        ranking = sorted(group, key=lambda unit: counts[unit["id"]], reverse=True)
        for unit in group:
            unit["openSignals"] = {
                "news": {
                    "provider": "GDELT 2.0 GKG",
                    "window": "2026-08-26 UTC",
                    "sampling": "20 hourly 15-minute files from 00:00-19:15 UTC; 20.8% time sample",
                    "matchedArticles": counts[unit["id"]],
                    "uniqueOutlets": len(outlets[unit["id"]]),
                    "scopeShare": round(counts[unit["id"]] / denominator, 6) if denominator else None,
                    "scopeRank": ranking.index(unit) + 1 if counts[unit["id"]] else None,
                    "keywords": ALIASES.get(unit["id"], [unit.get("socialSource", {}).get("article", unit["nameEn"])]),
                    "status": "snapshot",
                    "confidence": "C",
                },
                "researchDiffusion": {"provider": "Crossref Event Data", "status": "bulk_backfill_required"},
                "patents": {"provider": "USPTO Open Data / PatentsView", "status": "api_key_or_bulk_backfill_required"},
            }

    data["meta"]["openSignals"] = {
        "status": "partial_open_data",
        "newsSource": "GDELT 2.0 Global Knowledge Graph",
        "newsSourceUrl": "https://www.gdeltproject.org/data.html",
        "newsWindow": "2026-08-26 UTC",
        "newsSampling": "20 hourly 15-minute files from 00:00-19:15 UTC; 20.8% time sample",
        "sampledUniqueArticles": len(total_articles),
        "note": "News is a current fixed-window snapshot. Crossref and USPTO require large bulk backfills or credentials and are not silently estimated.",
    }
    data["meta"]["methodVersion"] = "v1.4"
    rendered = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    for path in DATA_PATHS:
        path.write_text(rendered)
    print(f"Wrote GDELT snapshot from {len(total_articles):,} sampled articles.", flush=True)


if __name__ == "__main__":
    main()
