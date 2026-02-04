#!/usr/bin/env python3
"""
Import seed_500.csv into Postgres.

Requires:
  - DATABASE_URL in environment
  - psycopg installed (see requirements.txt)
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from pathlib import Path
from typing import Optional

import psycopg


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import seed_500.csv into Postgres.")
    parser.add_argument(
        "--csv",
        default="data/seed/output/seed_500.csv",
        help="Path to seed_500.csv",
    )
    parser.add_argument("--dry-run", action="store_true", help="Validate and count rows only.")
    return parser.parse_args()


def parse_int(value: str) -> Optional[int]:
    value = value.strip()
    if not value:
        return None
    return int(value)


def parse_float(value: str) -> Optional[float]:
    value = value.strip()
    if not value:
        return None
    return float(value)


def main() -> int:
    args = parse_args()
    csv_path = Path(args.csv)
    if not csv_path.exists():
        print(f"[error] CSV not found: {csv_path}", file=sys.stderr)
        return 1

    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        print("[error] DATABASE_URL is not set.", file=sys.stderr)
        return 1

    rows = []
    with csv_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            rows.append(
                {
                    "title": row.get("title", "").strip(),
                    "wikipedia_title": row.get("wikipedia_title", "").strip() or None,
                    "wikidata_id": row.get("wikidata_id", "").strip() or None,
                    "seed_segment": row.get("segment", "").strip() or None,
                    "goat_score": parse_int(row.get("goat_score", "") or ""),
                    "pageviews_12m": parse_int(row.get("pageviews_12m", "") or ""),
                    "search_score": parse_float(row.get("search_score", "") or ""),
                }
            )

    if args.dry_run:
        print(f"[info] Parsed rows: {len(rows)}")
        return 0

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            for row in rows:
                cur.execute(
                    """
                    INSERT INTO films (
                        title,
                        wikipedia_title,
                        wikidata_id,
                        seed_segment,
                        goat_score,
                        pageviews_12m,
                        search_score
                    )
                    VALUES (
                        %(title)s,
                        %(wikipedia_title)s,
                        %(wikidata_id)s,
                        %(seed_segment)s,
                        %(goat_score)s,
                        %(pageviews_12m)s,
                        %(search_score)s
                    )
                    ON CONFLICT (wikidata_id) WHERE wikidata_id IS NOT NULL
                    DO UPDATE SET
                        title = EXCLUDED.title,
                        wikipedia_title = EXCLUDED.wikipedia_title,
                        seed_segment = EXCLUDED.seed_segment,
                        goat_score = EXCLUDED.goat_score,
                        pageviews_12m = EXCLUDED.pageviews_12m,
                        search_score = EXCLUDED.search_score
                    """,
                    row,
                )

    print(f"[info] Imported rows: {len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
