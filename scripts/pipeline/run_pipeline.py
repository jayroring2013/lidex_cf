#!/usr/bin/env python3
"""
scripts/pipeline/run_pipeline.py
--------------------------------------------------------------------------------
Unified CLI Orchestrator for LiDex Data Ingestion Pipeline.

Stages:
  1. clean-manga:      Purge all Manga data from DB (leaving Light Novels only).
  2. download-covers:  Download volume covers from Kurano (s3.kurano.moe).
  3. upload-covers:    Upload downloaded covers to Cloudflare R2 bucket.
  4. import-novels:    Evaluate LN market metrics & ingest series, volumes, and
                       ln_series_ranking into Neon PostgreSQL.

Usage:
    python scripts/pipeline/run_pipeline.py --all
    python scripts/pipeline/run_pipeline.py --clean-manga
    python scripts/pipeline/run_pipeline.py --download-covers
    python scripts/pipeline/run_pipeline.py --upload-covers
    python scripts/pipeline/run_pipeline.py --import-novels
    python scripts/pipeline/run_pipeline.py --dry-run
--------------------------------------------------------------------------------
"""

import os
import sys
import argparse

sys.stdout.reconfigure(encoding='utf-8')

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from clean_manga import clean_manga_data
from download_covers import download_all_covers, DEFAULT_EXCEL, DEFAULT_OUT_DIR
from upload_covers_to_r2 import upload_all_covers
from import_light_novels import run_import


def main():
    parser = argparse.ArgumentParser(description="LiDex Unified Data Pipeline Runner")
    parser.add_argument("--file", default=DEFAULT_EXCEL, help="Path to LN_Sum_from_Kurano.xlsx")
    parser.add_argument("--covers-dir", default=DEFAULT_OUT_DIR, help="Directory for downloaded cover images")
    parser.add_argument("--all", action="store_true", help="Run all pipeline stages end-to-end")
    parser.add_argument("--clean-manga", action="store_true", help="Purge all manga records from DB")
    parser.add_argument("--download-covers", action="store_true", help="Download covers from Kurano")
    parser.add_argument("--upload-covers", action="store_true", help="Upload covers to Cloudflare R2")
    parser.add_argument("--import-novels", action="store_true", help="Evaluate rankings and import series/volumes/rankings")
    parser.add_argument("--dry-run", action="store_true", help="Execute in preview / dry-run mode")
    parser.add_argument("--workers", type=int, default=16, help="Worker threads for downloads/uploads")

    args = parser.parse_args()

    run_all = args.all or (not args.clean_manga and not args.download_covers and not args.upload_covers and not args.import_novels)

    print("\n" + "=" * 80)
    print("  LiDex Unified Data Ingestion Pipeline")
    print(f"  Dry Run: {args.dry_run}")
    print(f"  Target File: {args.file}")
    print("=" * 80 + "\n")

    # Stage 1: Clean Manga
    if run_all or args.clean_manga:
        print("\n>>> STAGE 1: Purging Manga Records from DB...")
        clean_manga_data(dry_run=args.dry_run)

    # Stage 2: Download Covers
    if run_all or args.download_covers:
        print("\n>>> STAGE 2: Downloading Covers from Kurano...")
        download_all_covers(excel_path=args.file, out_dir=args.covers_dir, max_workers=args.workers)

    # Stage 3: Upload Covers to Cloudflare R2
    if run_all or args.upload_covers:
        print("\n>>> STAGE 3: Uploading Covers to Cloudflare R2...")
        upload_all_covers(covers_dir=args.covers_dir, dry_run=args.dry_run, max_workers=args.workers)

    # Stage 4: Import Light Novels
    if run_all or args.import_novels:
        print("\n>>> STAGE 4: Evaluating & Ingesting Light Novels into DB...")
        run_import(excel_path=args.file, dry_run=args.dry_run)

    print("\n" + "=" * 80)
    print("  Pipeline Execution Complete!")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    main()
