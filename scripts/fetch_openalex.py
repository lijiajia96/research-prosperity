#!/usr/bin/env python3
"""Build the MVP dataset from the public OpenAlex API.

Top venues are fixed per comparison unit using 2015-2019 CWTS Core journal articles.
Engineering and Computer Science keep their global aggregates and gain separate
same-level subfield drill-downs.
Candidates need at least 200 articles and are ranked by a Bayesian-shrunk
share of papers in OpenAlex's field/year/type-normalized top citation decile.
"""

from __future__ import annotations

import json
import math
import argparse
import statistics
import time
import urllib.parse
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path

API = "https://api.openalex.org"
START_YEAR = 2000
AS_OF = date(2026, 8, 26)
SEASON_YEARS = (2019, 2022, 2023, 2024, 2025)
ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "openalex-units-v12-min200"

ZH_FIELDS = {
    11: "农业与生物科学", 12: "艺术与人文", 13: "生化、遗传与分子生物学",
    14: "商业、管理与会计", 15: "化学工程", 16: "化学", 17: "计算机科学",
    18: "决策科学", 19: "地球与行星科学", 20: "经济学、计量经济学与金融",
    21: "能源", 22: "工程学", 23: "环境科学", 24: "免疫学与微生物学",
    25: "材料科学", 26: "数学", 27: "医学", 28: "神经科学", 29: "护理学",
    30: "药理、毒理与药剂学", 31: "物理学与天文学", 32: "心理学",
    33: "社会科学", 34: "兽医学", 35: "牙科学", 36: "健康专业",
}

ZH_ENGINEERING_SUBFIELDS = {
    2200: "综合工程", 2202: "航空航天工程", 2203: "汽车工程",
    2204: "生物医学工程", 2205: "土木与结构工程", 2206: "计算力学",
    2207: "控制与系统工程", 2208: "电气与电子工程", 2209: "工业与制造工程",
    2210: "机械工程", 2211: "材料力学", 2212: "海洋工程",
    2213: "安全、风险、可靠性与质量", 2214: "媒体技术",
    2215: "建筑与施工", 2216: "建筑学",
}

ZH_COMPUTER_SCIENCE_SUBFIELDS = {
    1702: "人工智能", 1703: "计算理论与数学", 1704: "计算机图形学与计算机辅助设计",
    1705: "计算机网络与通信", 1706: "计算机科学应用",
    1707: "计算机视觉与模式识别", 1708: "硬件与体系结构",
    1709: "人机交互", 1710: "信息系统", 1711: "信号处理", 1712: "软件工程",
}

ZH_DOMAINS = {
    "Life Sciences": "生命科学", "Social Sciences": "社会科学",
    "Physical Sciences": "物理科学", "Health Sciences": "健康科学",
}


def api(path: str, **params):
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    last_error = None
    for attempt in range(10):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "research-prosperity-mvp/1.0"})
            with urllib.request.urlopen(req, timeout=45) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code == 429:
                retry_after = int(exc.headers.get("Retry-After", "10"))
                time.sleep(min(60, max(retry_after, 3 * (attempt + 1))))
                continue
            time.sleep(min(12, 0.8 * (2**attempt)))
        except Exception as exc:  # network/API retry boundary
            last_error = exc
            time.sleep(min(12, 0.8 * (2**attempt)))
    raise RuntimeError(f"OpenAlex request failed: {url}") from last_error


def groups(filters: str, group_by: str):
    payload = api("works", filter=filters, group_by=group_by, per_page=200)
    return {str(row["key"]).split("/")[-1]: int(row["count"]) for row in payload.get("group_by", [])}


def count(filters: str):
    return int(api("works", filter=filters, per_page=1)["meta"]["count"])


def source_filter(ids):
    return "|".join(ids)


def unit_base(unit):
    unit_id = int(unit["id"].split("/")[-1])
    level = unit.get("level", "field")
    return f"primary_topic.{level}.id:{unit_id},type:article,primary_location.source.is_core:true"


def select_top_journals(unit):
    unit_id = int(unit["id"].split("/")[-1])
    base = unit_base(unit) + ",from_publication_date:2015-01-01,to_publication_date:2019-12-31"
    total = groups(base, "primary_location.source.id")
    cited = groups(base + ",citation_normalized_percentile.is_in_top_10_percent:true", "primary_location.source.id")
    names_payload = api("works", filter=base, group_by="primary_location.source.id", per_page=200)
    names = {row["key"].split("/")[-1]: row["key_display_name"] for row in names_payload.get("group_by", [])}
    candidates = []
    minimum_articles = 200
    for source_id, n in total.items():
        if n < minimum_articles:
            continue
        top = cited.get(source_id, 0)
        shrunk_share = (top + 10) / (n + 100)  # 10% prior, strength 100
        candidates.append({
            "id": source_id,
            "name": names.get(source_id, source_id),
            "baselineArticles": n,
            "top10Share": round(top / n, 4),
            "selectionScore": round(shrunk_share, 4),
        })
    candidates.sort(key=lambda x: (x["selectionScore"], x["baselineArticles"]), reverse=True)
    return unit_id, candidates[:10]


def fetch_unit(unit, journals):
    unit_id = int(unit["id"].split("/")[-1])
    base = unit_base(unit)
    journal_ids = [j["id"] for j in journals]
    elite = base + f",primary_location.source.id:{source_filter(journal_ids)}" if journal_ids else None
    through_2025 = ",from_publication_date:2000-01-01,to_publication_date:2025-12-31"

    all_counts = groups(base + through_2025, "publication_year")
    elite_counts = groups(elite + through_2025, "publication_year") if elite else {}
    elite_top10 = groups(elite + through_2025 + ",citation_normalized_percentile.is_in_top_10_percent:true", "publication_year") if elite else {}

    actual_2026 = count(elite + f",from_publication_date:2026-01-01,to_publication_date:{AS_OF.isoformat()}") if elite else 0
    all_2026 = count(base + f",from_publication_date:2026-01-01,to_publication_date:{AS_OF.isoformat()}")
    top10_2026 = count(elite + f",from_publication_date:2026-01-01,to_publication_date:{AS_OF.isoformat()},citation_normalized_percentile.is_in_top_10_percent:true") if elite else 0

    fractions = []
    for year in SEASON_YEARS:
        partial = count(elite + f",from_publication_date:{year}-01-01,to_publication_date:{year}-08-26") if elite else 0
        full = elite_counts.get(str(year), 0)
        if full:
            fractions.append(partial / full)
    season_fraction = statistics.median(fractions) if fractions else AS_OF.timetuple().tm_yday / 365
    forecast_2026 = round(actual_2026 / season_fraction) if season_fraction else actual_2026

    metrics = []
    for year in range(START_YEAR, AS_OF.year + 1):
        is_current = year == AS_OF.year
        n = actual_2026 if is_current else elite_counts.get(str(year), 0)
        all_n = all_2026 if is_current else all_counts.get(str(year), 0)
        cited_n = top10_2026 if is_current else elite_top10.get(str(year), 0)
        status = "partial" if year == 2026 else "provisional" if year >= 2024 else "mature"
        metrics.append({
            "year": year,
            "status": status,
            "topPaperCount": n,
            "forecastCount": forecast_2026 if is_current else n,
            "fieldPaperCount": all_n,
            "fieldTopShare": round(n / all_n, 4) if all_n else None,
            "top10CitedShare": round(cited_n / n, 4) if n else None,
        })
    return {
        "id": unit_id,
        "level": unit.get("level", "field"),
        "parentField": unit.get("parentField"),
        "name": (ZH_COMPUTER_SCIENCE_SUBFIELDS if unit.get("parentField") == "计算机科学" else ZH_ENGINEERING_SUBFIELDS if unit.get("level") == "subfield" else ZH_FIELDS).get(unit_id, unit["display_name"]),
        "nameEn": unit["display_name"],
        "domain": ZH_DOMAINS.get(unit["domain"]["display_name"], unit["domain"]["display_name"]),
        "seasonFraction": round(season_fraction, 4),
        "topJournals": journals,
        "metrics": metrics,
    }


def percentile(values, value):
    valid = sorted(v for v in values if v is not None and math.isfinite(v))
    if not valid:
        return 50.0
    if len(valid) == 1:
        return 50.0
    below = sum(v < value for v in valid)
    equal = sum(v == value for v in valid)
    return 100 * (below + 0.5 * equal) / len(valid)


def enrich(fields):
    by_year = {year: [] for year in range(START_YEAR, AS_OF.year + 1)}
    for field in fields:
        for metric in field["metrics"]:
            by_year[metric["year"]].append((field, metric))

    for year, rows in by_year.items():
        global_top = sum((m["forecastCount"] if year == 2026 else m["topPaperCount"]) for _, m in rows)
        volumes, qualities, momenta = [], [], []
        for field, metric in rows:
            current = metric["forecastCount"] if year == 2026 else metric["topPaperCount"]
            metric["globalShare"] = round(current / global_top, 4) if global_top else None
            history = {m["year"]: m for m in field["metrics"]}
            previous = history.get(year - 1)
            past5 = history.get(year - 5)
            prev_count = previous["topPaperCount"] if previous else 0
            past_count = past5["topPaperCount"] if past5 else 0
            metric["yoyGrowth"] = round(current / prev_count - 1, 4) if prev_count else None
            metric["cagr5"] = round((current / past_count) ** 0.2 - 1, 4) if current and past_count else None
            old_q = past5["top10CitedShare"] if past5 else None
            q = metric["top10CitedShare"]
            metric["qualityChange5"] = round(q - old_q, 4) if q is not None and old_q is not None else None
            momentum = None
            if metric["cagr5"] is not None:
                momentum = metric["cagr5"] + (metric["qualityChange5"] or 0) / 5
            volumes.append(math.log1p(current))
            qualities.append(q)
            momenta.append(momentum)

        for idx, (_, metric) in enumerate(rows):
            v = percentile(volumes, volumes[idx])
            q = percentile(qualities, qualities[idx]) if qualities[idx] is not None else None
            m = percentile(momenta, momenta[idx]) if momenta[idx] is not None else None
            metric["volumeScore"] = round(v, 1)
            metric["qualityScore"] = round(q, 1) if q is not None else None
            metric["momentumScore"] = round(m, 1) if m is not None else None
            metric["prosperityScore"] = round(0.40 * v + 0.35 * q + 0.25 * m, 1) if q is not None and m is not None else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true", help="refresh global fields as well as subfield drill-downs")
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    fields_payload = api("fields", per_page=100)
    fields = [
        {**field, "level": "field", "parentField": None}
        for field in fields_payload["results"]
    ]
    subfields_payload = api("subfields", filter="field.id:22", per_page=100)
    engineering_subfields = [
        {**subfield, "level": "subfield", "parentField": "工程学"}
        for subfield in subfields_payload["results"]
    ]
    engineering_subfields.sort(key=lambda f: int(f["id"].split("/")[-1]))
    computer_science_payload = api("subfields", filter="field.id:17", per_page=100)
    computer_science_subfields = [
        {**subfield, "level": "subfield", "parentField": "计算机科学"}
        for subfield in computer_science_payload["results"]
    ]
    computer_science_subfields.sort(key=lambda f: int(f["id"].split("/")[-1]))
    drilldowns = engineering_subfields + computer_science_subfields
    units = sorted(fields, key=lambda f: int(f["id"].split("/")[-1])) + drilldowns if args.full else drilldowns

    journal_map = {}
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = []
        for unit in units:
            unit_id = int(unit["id"].split("/")[-1])
            cache_path = CACHE / f"journals-{unit_id}.json"
            if cache_path.exists():
                journal_map[unit_id] = json.loads(cache_path.read_text(encoding="utf-8"))
            else:
                futures.append(pool.submit(select_top_journals, unit))
        for future in as_completed(futures):
            unit_id, journals = future.result()
            journal_map[unit_id] = journals
            (CACHE / f"journals-{unit_id}.json").write_text(json.dumps(journals, ensure_ascii=False), encoding="utf-8")
            print(f"selected journals for unit {unit_id}", flush=True)

    results = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {}
        for unit in units:
            unit_id = int(unit["id"].split("/")[-1])
            cache_path = CACHE / f"history-{unit_id}.json"
            if cache_path.exists():
                results.append(json.loads(cache_path.read_text(encoding="utf-8")))
            else:
                futures[pool.submit(fetch_unit, unit, journal_map[unit_id])] = unit
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            (CACHE / f"history-{result['id']}.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
            print(f"fetched history for {result['name']}", flush=True)

    results.sort(key=lambda f: f["id"])
    existing_path = ROOT / "app" / "data" / "openalex.json"
    existing = json.loads(existing_path.read_text(encoding="utf-8")) if existing_path.exists() else None
    field_results = [result for result in results if result["level"] == "field"]
    if not args.full and existing:
        field_results = [
            {**field, "level": field.get("level", "field"), "parentField": field.get("parentField")}
            for field in existing["fields"]
        ]
    engineering_results = [result for result in results if result.get("parentField") == "工程学"]
    computer_science_results = [result for result in results if result.get("parentField") == "计算机科学"]
    # Scores and ranks are normalized only against peers at the same hierarchy level.
    enrich(field_results)
    enrich(engineering_results)
    enrich(computer_science_results)
    payload = {
        "meta": {
            "source": "OpenAlex",
            "sourceUrl": "https://openalex.org",
            "asOf": AS_OF.isoformat(),
            "startYear": START_YEAR,
            "latestMatureYear": 2023,
            "latestCompleteVolumeYear": 2025,
            "fieldCount": len(field_results),
            "fieldLevelCount": len(field_results),
            "engineeringSubfieldCount": len(engineering_subfields),
            "computerScienceSubfieldCount": len(computer_science_subfields),
            "methodVersion": "1.2",
            "note": "2026为截至8月26日的年内数据；预测值按各领域历史同期发表占比校正。",
        },
        "fields": field_results,
        "engineeringSubfields": engineering_results,
        "computerScienceSubfields": computer_science_results,
    }
    out = ROOT / "app" / "data" / "openalex.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    public_out = ROOT / "public" / "data" / "openalex.json"
    public_out.parent.mkdir(parents=True, exist_ok=True)
    public_out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
