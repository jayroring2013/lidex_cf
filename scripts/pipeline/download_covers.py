#!/usr/bin/env python3
"""
scripts/pipeline/download_covers.py
--------------------------------------------------------------------------------
Downloads all volume cover images from Kurano (s3.kurano.moe) locally.
Prepares them for upload to Cloudflare R2 bucket (`lidex-covers/covers/`).

Usage:
    python scripts/pipeline/download_covers.py
    python scripts/pipeline/download_covers.py --file="path/to/LN_Sum_from_Kurano.xlsx" --out-dir="data/covers"
--------------------------------------------------------------------------------
"""

import os
import sys
import argparse
import requests
import urllib3
import pandas as pd
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
sys.stdout.reconfigure(encoding='utf-8')

DEFAULT_EXCEL = r"C:\Users\ADMIN\Desktop\Web\Organized\LN_Sum_from_Kurano.xlsx"
DEFAULT_OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "covers")
CF_PUBLIC_URL = "https://pub-2080c0fa70954a7e98e48daff887c4cf.r2.dev"


def extract_filename_from_url(url: str) -> str:
    """
    Extracts a clean, safe filename from a cover URL.
    E.g.
      https://s3.kurano.moe/kurano/vn-releases/b5f0a9b2-3083-486e-bc49-b562fe916243/image
      -> b5f0a9b2-3083-486e-bc49-b562fe916243.jpg
      https://cdn1.fahasa.com/media/catalog/product/a/i/ai_da_giet_anh_hung.jpg
      -> ai_da_giet_anh_hung.jpg
    """
    if not url or pd.isna(url):
        return ""
    
    url_clean = str(url).split("?")[0].strip()
    parts = [p for p in url_clean.split("/") if p]
    if not parts:
        return ""
    
    last = parts[-1].lower()
    if last in ("image", "cover", "raw", "download") and len(parts) >= 2:
        file_id = parts[-2]
        return f"{file_id}.jpg"
    
    if "." in parts[-1]:
        return parts[-1]
    
    return f"{parts[-1]}.jpg"


def get_r2_url(filename: str, public_url: str = CF_PUBLIC_URL) -> str:
    if not filename:
        return ""
    return f"{public_url.rstrip('/')}/covers/{filename}"


def download_single_cover(session: requests.Session, url: str, target_path: Path) -> tuple[str, bool, str]:
    if target_path.exists() and target_path.stat().st_size > 0:
        return url, True, "cached"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://kurano.moe/",
    }
    
    try:
        resp = session.get(url, headers=headers, verify=False, timeout=20)
        if resp.status_code == 200 and len(resp.content) > 100:
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_bytes(resp.content)
            return url, True, "downloaded"
        else:
            return url, False, f"HTTP {resp.status_code} (size {len(resp.content)})"
    except Exception as e:
        return url, False, str(e)


def download_all_covers(excel_path: str = DEFAULT_EXCEL, out_dir: str = DEFAULT_OUT_DIR, max_workers: int = 16) -> dict[str, str]:
    """
    Downloads all covers from the Excel 'Kurano Enriched' sheet.
    Returns mapping: original_url -> r2_url.
    """
    print(f"Loading Excel file: {excel_path}")
    df = pd.read_excel(excel_path, sheet_name="Kurano Enriched")
    
    valid_covers = df.dropna(subset=["Cover URL"]).copy()
    print(f"Found {len(valid_covers)} rows with Cover URL out of {len(df)} total rows.")
    
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    print(f"Saving covers to: {out_path.resolve()}")
    
    url_to_r2 = {}
    download_tasks = []
    
    for idx, row in valid_covers.iterrows():
        url = str(row["Cover URL"]).strip()
        filename = extract_filename_from_url(url)
        if not filename:
            continue
        
        r2_url = get_r2_url(filename)
        url_to_r2[url] = r2_url
        dest_file = out_path / filename
        download_tasks.append((url, dest_file))
    
    print(f"Total unique download tasks: {len(download_tasks)}")
    
    cached_count = 0
    downloaded_count = 0
    failed_count = 0
    
    session = requests.Session()
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(download_single_cover, session, url, path): (url, path)
            for url, path in download_tasks
        }
        
        for future in as_completed(futures):
            url, success, status = future.result()
            if success:
                if status == "cached":
                    cached_count += 1
                else:
                    downloaded_count += 1
            else:
                failed_count += 1
                print(f"  ❌ Failed {url}: {status}")
            
            total_done = cached_count + downloaded_count + failed_count
            if total_done % 100 == 0 or total_done == len(download_tasks):
                print(f"Progress: {total_done}/{len(download_tasks)} (Downloaded: {downloaded_count}, Cached: {cached_count}, Failed: {failed_count})")
    
    print("\n=== Download Summary ===")
    print(f"  - Total processed: {len(download_tasks)}")
    print(f"  - Newly downloaded: {downloaded_count}")
    print(f"  - Already cached:   {cached_count}")
    print(f"  - Failed:           {failed_count}")
    print(f"  - Output directory: {out_path.resolve()}")
    
    return url_to_r2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download Kurano cover images")
    parser.add_argument("--file", default=DEFAULT_EXCEL, help="Path to LN_Sum_from_Kurano.xlsx")
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR, help="Destination directory for covers")
    parser.add_argument("--workers", type=int, default=16, help="Concurrent worker threads")
    args = parser.parse_args()
    
    download_all_covers(excel_path=args.file, out_dir=args.out_dir, max_workers=args.workers)
