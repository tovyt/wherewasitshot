#!/usr/bin/env python3
"""
Build a 500-film seed list:
 - 100 reserved "greatest of all time" via consensus lists
 - 400 most-likely searched via Wikipedia pageviews (English)

Uses:
 - Wikidata Query Service (WDQS) to verify film items and map to enwiki articles
 - Wikimedia Pageviews API for per-article views
 - MediaWiki API to parse list pages
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import re
import sys
import time
import urllib.parse
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed

WIKIMEDIA_REST = "https://wikimedia.org/api/rest_v1"
WDQS_ENDPOINT = "https://query.wikidata.org/sparql"
MW_API = "https://en.wikipedia.org/w/api.php"

# Default queries for GOAT lists (resolved via MediaWiki opensearch)
GOAT_LIST_QUERIES = [
    {"id": "bfi_sight_sound_critics", "query": "Sight & Sound Greatest Films of All Time 2022"},
    {"id": "afi_100_years_100_movies", "query": "AFI's 100 Years...100 Movies"},
    {"id": "imdb_top_250", "query": "IMDb Top 250"},
    {"id": "letterboxd_top_250", "query": "Letterboxd Top 250"},
    {"id": "tspdt", "query": "They Shoot Pictures, Don't They?"},
]

EXCLUDED_NAMESPACE_PREFIXES = {
    "File",
    "Category",
    "Wikipedia",
    "Template",
    "Portal",
    "Help",
    "Special",
    "Talk",
    "User",
    "Draft",
    "Module",
    "Book",
}


@dataclass(frozen=True)
class FilmItem:
    title: str
    wikipedia_title: str
    wikidata_id: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build 500-film seed list.")
    parser.add_argument("--output-dir", default="data/seed/output", help="Output directory.")
    parser.add_argument("--cache-dir", default="data/seed/cache", help="Cache directory.")
    parser.add_argument("--months", type=int, default=12, help="Number of complete months to include.")
    parser.add_argument("--top-limit", type=int, default=1000, help="Max items per month from top endpoint.")
    parser.add_argument("--goat-limit", type=int, default=100, help="Number of GOAT films to reserve.")
    parser.add_argument("--seed-limit", type=int, default=500, help="Total seed list size.")
    parser.add_argument("--max-workers", type=int, default=6, help="Max concurrent requests.")
    parser.add_argument("--sleep", type=float, default=0.1, help="Sleep between requests (seconds).")
    parser.add_argument("--user-agent", default="FilmLocationSeedBot/0.1 (contact@example.com)")
    parser.add_argument("--no-cache", action="store_true", help="Disable cache reads.")
    parser.add_argument("--save-cache", action="store_true", help="Persist responses to cache.")
    parser.add_argument("--us-weight-file", default=None, help="Optional CSV: title,weight for US weighting.")
    return parser.parse_args()


def ensure_dirs(*paths: Path) -> None:
    for path in paths:
        path.mkdir(parents=True, exist_ok=True)


def last_complete_month(today: dt.date) -> Tuple[int, int]:
    first_of_month = today.replace(day=1)
    last_month_date = first_of_month - dt.timedelta(days=1)
    return last_month_date.year, last_month_date.month


def month_sequence(end_year: int, end_month: int, count: int) -> List[Tuple[int, int]]:
    months = []
    year, month = end_year, end_month
    for _ in range(count):
        months.append((year, month))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    months.reverse()
    return months


def date_range_for_months(months: List[Tuple[int, int]]) -> Tuple[str, str]:
    start_year, start_month = months[0]
    end_year, end_month = months[-1]
    start_date = dt.date(start_year, start_month, 1)
    end_day = (dt.date(end_year, end_month, 1) + dt.timedelta(days=32)).replace(day=1) - dt.timedelta(days=1)
    return start_date.strftime("%Y%m%d"), end_day.strftime("%Y%m%d")


def cache_path(cache_dir: Path, key: str) -> Path:
    safe = re.sub(r"[^a-zA-Z0-9._-]", "_", key)
    return cache_dir / f"{safe}.json"


def fetch_json(
    url: str,
    params: Optional[Dict[str, str]] = None,
    headers: Optional[Dict[str, str]] = None,
    cache_dir: Optional[Path] = None,
    cache_key: Optional[str] = None,
    use_cache: bool = True,
    save_cache: bool = False,
    sleep: float = 0.0,
    timeout: int = 30,
) -> Dict:
    if cache_dir and cache_key and use_cache:
        cached = cache_path(cache_dir, cache_key)
        if cached.exists():
            return json.loads(cached.read_text())

    if sleep:
        time.sleep(sleep)

    response = requests.get(url, params=params, headers=headers, timeout=timeout)
    response.raise_for_status()
    data = response.json()

    if cache_dir and cache_key and save_cache:
        cache_path(cache_dir, cache_key).write_text(json.dumps(data))

    return data


def is_article_title(title: str) -> bool:
    if title in {"Main_Page", "Main Page"}:
        return False
    if ":" in title:
        prefix = title.split(":", 1)[0]
        if prefix in EXCLUDED_NAMESPACE_PREFIXES:
            return False
    return True


def title_to_url(title: str) -> str:
    normalized = title.replace(" ", "_")
    return f"https://en.wikipedia.org/wiki/{urllib.parse.quote(normalized)}"


def url_to_title(url: str) -> str:
    path = urllib.parse.urlparse(url).path
    title = path.rsplit("/", 1)[-1]
    return urllib.parse.unquote(title).replace("_", " ")


def fetch_top_month(
    year: int,
    month: int,
    headers: Dict[str, str],
    cache_dir: Path,
    use_cache: bool,
    save_cache: bool,
    sleep: float,
) -> List[Dict]:
    url = f"{WIKIMEDIA_REST}/metrics/pageviews/top/en.wikipedia.org/all-access/{year}/{month:02d}/all-days"
    data = fetch_json(
        url,
        headers=headers,
        cache_dir=cache_dir,
        cache_key=f"top_{year}_{month:02d}",
        use_cache=use_cache,
        save_cache=save_cache,
        sleep=sleep,
    )
    items = data.get("items", [])
    if not items:
        return []
    return items[0].get("articles", [])


def build_candidate_titles(
    months: List[Tuple[int, int]],
    top_limit: int,
    headers: Dict[str, str],
    cache_dir: Path,
    use_cache: bool,
    save_cache: bool,
    sleep: float,
) -> Dict[str, int]:
    totals: Dict[str, int] = defaultdict(int)
    for year, month in months:
        articles = fetch_top_month(
            year=year,
            month=month,
            headers=headers,
            cache_dir=cache_dir,
            use_cache=use_cache,
            save_cache=save_cache,
            sleep=sleep,
        )
        for entry in articles[:top_limit]:
            title = entry.get("article")
            if not title or not is_article_title(title):
                continue
            totals[title.replace("_", " ")] += int(entry.get("views", 0))
    return totals


def wdqs_film_filter(
    titles: List[str],
    headers: Dict[str, str],
    cache_dir: Path,
    use_cache: bool,
    save_cache: bool,
    sleep: float,
) -> List[FilmItem]:
    if not titles:
        return []

    article_urls = [title_to_url(t) for t in titles]
    values_block = " ".join(f"<{u}>" for u in article_urls)

    query = f"""
PREFIX schema: <http://schema.org/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
SELECT ?article ?item ?itemLabel WHERE {{
  VALUES ?article {{ {values_block} }}
  ?article schema:about ?item ;
           schema:isPartOf <https://en.wikipedia.org/> .
  ?item wdt:P31/wdt:P279* wd:Q11424 .
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}
"""

    params = {"query": query, "format": "json"}
    data = fetch_json(
        WDQS_ENDPOINT,
        params=params,
        headers=headers,
        cache_dir=cache_dir,
        cache_key=f"wdqs_{hashlib.sha1(values_block.encode('utf-8')).hexdigest()}",
        use_cache=use_cache,
        save_cache=save_cache,
        sleep=sleep,
        timeout=60,
    )

    results = []
    for binding in data.get("results", {}).get("bindings", []):
        article_url = binding["article"]["value"]
        wikidata_id = binding["item"]["value"].rsplit("/", 1)[-1]
        label = binding.get("itemLabel", {}).get("value") or url_to_title(article_url)
        results.append(
            FilmItem(
                title=label,
                wikipedia_title=url_to_title(article_url),
                wikidata_id=wikidata_id,
            )
        )
    return results


def filter_films(
    titles: List[str],
    headers: Dict[str, str],
    cache_dir: Path,
    use_cache: bool,
    save_cache: bool,
    sleep: float,
    batch_size: int = 200,
) -> List[FilmItem]:
    films: Dict[str, FilmItem] = {}
    for i in range(0, len(titles), batch_size):
        batch = titles[i : i + batch_size]
        for item in wdqs_film_filter(
            batch,
            headers=headers,
            cache_dir=cache_dir,
            use_cache=use_cache,
            save_cache=save_cache,
            sleep=sleep,
        ):
            key = normalize_key(item.wikipedia_title)
            if key not in films:
                films[key] = item
    return list(films.values())


def fetch_pageviews_total(
    title: str,
    start: str,
    end: str,
    headers: Dict[str, str],
    cache_dir: Path,
    use_cache: bool,
    save_cache: bool,
    sleep: float,
) -> int:
    article = urllib.parse.quote(title.replace(" ", "_"), safe="")
    url = f"{WIKIMEDIA_REST}/metrics/pageviews/per-article/en.wikipedia.org/all-access/all-agents/{article}/daily/{start}/{end}"
    data = fetch_json(
        url,
        headers=headers,
        cache_dir=cache_dir,
        cache_key=f"pv_{article}_{start}_{end}",
        use_cache=use_cache,
        save_cache=save_cache,
        sleep=sleep,
    )
    return sum(int(item.get("views", 0)) for item in data.get("items", []))


def mw_opensearch(query: str, headers: Dict[str, str], sleep: float) -> Optional[str]:
    params = {
        "action": "opensearch",
        "search": query,
        "limit": 1,
        "namespace": 0,
        "format": "json",
    }
    data = fetch_json(
        MW_API,
        params=params,
        headers=headers,
        sleep=sleep,
    )
    if isinstance(data, list) and len(data) >= 2 and data[1]:
        return data[1][0]
    return None


def mw_parse_html(page_title: str, headers: Dict[str, str], sleep: float) -> Optional[str]:
    params = {
        "action": "parse",
        "page": page_title,
        "prop": "text",
        "format": "json",
    }
    data = fetch_json(MW_API, params=params, headers=headers, sleep=sleep)
    if "parse" not in data:
        return None
    return data["parse"]["text"]["*"]


def normalize_key(title: str) -> str:
    return re.sub(r"\s+", " ", title.strip().lower())


def extract_ranked_from_html(html: str) -> List[Tuple[int, str]]:
    soup = BeautifulSoup(html, "html.parser")

    # Prefer ordered lists with significant length.
    for ol in soup.find_all("ol"):
        lis = ol.find_all("li", recursive=False)
        if len(lis) < 50:
            continue
        results: List[Tuple[int, str]] = []
        for idx, li in enumerate(lis, start=1):
            title = extract_title_from_node(li)
            if title:
                results.append((idx, title))
        if results:
            return results

    # Fallback to tables with rank column.
    table_candidates = soup.select("table.wikitable, table.sortable, table")
    for table in table_candidates:
        results: List[Tuple[int, str]] = []
        for row in table.find_all("tr"):
            cells = row.find_all(["th", "td"])
            if not cells:
                continue
            rank = extract_rank(cells[0].get_text())
            if rank is None:
                continue
            title = extract_title_from_node(row)
            if title:
                results.append((rank, title))
        if results:
            return results

    return []


def extract_rank(text: str) -> Optional[int]:
    match = re.search(r"\b(\d{1,3})\b", text)
    if match:
        return int(match.group(1))
    return None


def extract_title_from_node(node) -> Optional[str]:
    # Prefer italicized film titles.
    italic = node.find("i")
    if italic:
        link = italic.find("a")
        if link and link.get("href", "").startswith("/wiki/"):
            return link.get_text(strip=True)
        text = italic.get_text(strip=True)
        if text:
            return text

    # Fallback to first valid link.
    for link in node.find_all("a"):
        href = link.get("href", "")
        if not href.startswith("/wiki/"):
            continue
        title = link.get("title") or link.get_text(strip=True)
        if not title:
            continue
        if ":" in title:
            prefix = title.split(":", 1)[0]
            if prefix in EXCLUDED_NAMESPACE_PREFIXES:
                continue
        return title
    return None


def build_goat_scores(
    headers: Dict[str, str],
    sleep: float,
) -> Dict[str, Dict[str, int]]:
    scores: Dict[str, Dict[str, int]] = {}

    for entry in GOAT_LIST_QUERIES:
        list_id = entry["id"]
        query = entry["query"]
        page_title = mw_opensearch(query, headers=headers, sleep=sleep)
        if not page_title:
            print(f"[warn] No Wikipedia page found for list query: {query}", file=sys.stderr)
            continue

        html = mw_parse_html(page_title, headers=headers, sleep=sleep)
        if not html:
            print(f"[warn] Failed to parse list page: {page_title}", file=sys.stderr)
            continue

        ranked = extract_ranked_from_html(html)
        if not ranked:
            print(f"[warn] No ranked results detected for list page: {page_title}", file=sys.stderr)
            continue

        for rank, title in ranked:
            points = max(0, 101 - rank)
            key = normalize_key(title)
            entry_score = scores.setdefault(
                key, {"points": 0, "lists": 0, "best_rank": 999, "title": title}
            )
            entry_score["points"] += points
            entry_score["lists"] += 1
            entry_score["best_rank"] = min(entry_score["best_rank"], rank)
            entry_score["title"] = title

    return scores


def load_us_weights(path: Optional[str]) -> Dict[str, float]:
    if not path:
        return {}
    weights: Dict[str, float] = {}
    with open(path, newline="", encoding="utf-8") as handle:
        for row in handle:
            row = row.strip()
            if not row or row.startswith("#"):
                continue
            parts = [p.strip() for p in row.split(",")]
            if len(parts) < 2:
                continue
            title, weight_str = parts[0], parts[1]
            try:
                weights[normalize_key(title)] = float(weight_str)
            except ValueError:
                continue
    return weights


def main() -> int:
    args = parse_args()
    output_dir = Path(args.output_dir)
    cache_dir = Path(args.cache_dir)
    ensure_dirs(output_dir, cache_dir)

    headers = {"User-Agent": args.user_agent}

    today = dt.date.today()
    end_year, end_month = last_complete_month(today)
    months = month_sequence(end_year, end_month, args.months)
    start_date, end_date = date_range_for_months(months)

    print(f"[info] Window: {start_date} -> {end_date}")

    print("[info] Building candidate list from top pages...")
    candidate_views = build_candidate_titles(
        months=months,
        top_limit=args.top_limit,
        headers=headers,
        cache_dir=cache_dir,
        use_cache=not args.no_cache,
        save_cache=args.save_cache,
        sleep=args.sleep,
    )

    candidates = list(candidate_views.keys())
    print(f"[info] Candidate titles: {len(candidates)}")

    print("[info] Filtering candidates to films via WDQS...")
    film_items = filter_films(
        candidates,
        headers=headers,
        cache_dir=cache_dir,
        use_cache=not args.no_cache,
        save_cache=args.save_cache,
        sleep=args.sleep,
    )
    print(f"[info] Film candidates: {len(film_items)}")

    film_by_key = {normalize_key(item.wikipedia_title): item for item in film_items}

    print("[info] Computing GOAT list scores...")
    goat_scores = build_goat_scores(headers=headers, sleep=args.sleep)

    # Resolve GOAT titles to film items via WDQS
    goat_titles = [entry["title"] for entry in goat_scores.values()]
    goat_items = filter_films(
        goat_titles,
        headers=headers,
        cache_dir=cache_dir,
        use_cache=not args.no_cache,
        save_cache=args.save_cache,
        sleep=args.sleep,
    )
    # Ensure GOAT items are included even if they were not in top-page candidates.
    for item in goat_items:
        key = normalize_key(item.wikipedia_title)
        if key not in film_by_key:
            film_by_key[key] = item

    goat_keys = {normalize_key(item.wikipedia_title) for item in goat_items}

    goat_ranked = sorted(
        [
            (key, data)
            for key, data in goat_scores.items()
            if normalize_key(data["title"]) in goat_keys
        ],
        key=lambda item: (-item[1]["points"], -item[1]["lists"], item[1]["best_rank"]),
    )
    goat_ranked = goat_ranked[: args.goat_limit]

    goat_selected: Dict[str, Dict[str, int]] = {key: data for key, data in goat_ranked}

    print("[info] Fetching pageviews for film candidates...")
    pv_totals: Dict[str, int] = {}
    def fetch_one(entry: Tuple[str, FilmItem]) -> Tuple[str, int, Optional[Exception]]:
        key, item = entry
        try:
            total = fetch_pageviews_total(
                item.wikipedia_title,
                start=start_date,
                end=end_date,
                headers=headers,
                cache_dir=cache_dir,
                use_cache=not args.no_cache,
                save_cache=args.save_cache,
                sleep=args.sleep,
            )
            return key, total, None
        except Exception as exc:  # noqa: BLE001 - reporting all failures for visibility
            return key, 0, exc

    with ThreadPoolExecutor(max_workers=args.max_workers) as executor:
        futures = [executor.submit(fetch_one, entry) for entry in film_by_key.items()]
        for future in as_completed(futures):
            key, total, exc = future.result()
            if exc:
                print(
                    f"[warn] Pageviews failed for {film_by_key[key].wikipedia_title}: {exc}",
                    file=sys.stderr,
                )
            pv_totals[key] = total

    max_pv = max(pv_totals.values()) if pv_totals else 1
    us_weights = load_us_weights(args.us_weight_file)

    def search_score(key: str) -> float:
        pv_norm = pv_totals.get(key, 0) / max_pv
        us_weight = us_weights.get(key, 0.0)
        if us_weights:
            return 0.75 * pv_norm + 0.25 * us_weight
        return pv_norm

    goat_keys = set(goat_selected.keys())
    likely_candidates = [
        (key, search_score(key))
        for key in film_by_key.keys()
        if key not in goat_keys
    ]
    likely_candidates.sort(key=lambda item: item[1], reverse=True)
    likely_selected = likely_candidates[: max(0, args.seed_limit - args.goat_limit)]

    seed_items = []
    for key, data in goat_selected.items():
        item = film_by_key.get(key)
        if not item:
            continue
        seed_items.append(
            {
                "title": item.title,
                "wikipedia_title": item.wikipedia_title,
                "wikidata_id": item.wikidata_id,
                "segment": "goat",
                "goat_score": data["points"],
                "pageviews_12m": pv_totals.get(key, 0),
                "search_score": search_score(key),
            }
        )
    for key, score in likely_selected:
        item = film_by_key.get(key)
        if not item:
            continue
        seed_items.append(
            {
                "title": item.title,
                "wikipedia_title": item.wikipedia_title,
                "wikidata_id": item.wikidata_id,
                "segment": "likely",
                "goat_score": None,
                "pageviews_12m": pv_totals.get(key, 0),
                "search_score": score,
            }
        )

    output = {
        "generated_at": dt.datetime.utcnow().isoformat() + "Z",
        "window": {"start": start_date, "end": end_date},
        "counts": {
            "candidates": len(candidates),
            "film_candidates": len(film_by_key),
            "goat_selected": len(goat_selected),
            "likely_selected": len(likely_selected),
        },
        "items": seed_items,
    }

    json_path = output_dir / "seed_500.json"
    csv_path = output_dir / "seed_500.csv"
    json_path.write_text(json.dumps(output, indent=2))

    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        header = [
            "title",
            "wikipedia_title",
            "wikidata_id",
            "segment",
            "goat_score",
            "pageviews_12m",
            "search_score",
        ]
        handle.write(",".join(header) + "\n")
        for item in seed_items:
            row = [
                item["title"],
                item["wikipedia_title"],
                item["wikidata_id"],
                item["segment"],
                "" if item["goat_score"] is None else str(item["goat_score"]),
                str(item["pageviews_12m"]),
                f"{item['search_score']:.6f}",
            ]
            handle.write(",".join(f'"{col}"' for col in row) + "\n")

    print(f"[info] Wrote: {json_path}")
    print(f"[info] Wrote: {csv_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
