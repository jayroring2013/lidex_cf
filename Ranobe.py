import asyncio
import aiohttp
import random
import pandas as pd
import json
import os
import argparse
import time

BASE_URL = "https://ranobedb.org/api/v0"
DEFAULT_OUTPUT_EXCEL = "ranobedb_flat.xlsx"
DEFAULT_JSONL_CHECKPOINT = "ranobedb_flat.jsonl"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}

# Global statistics to track progress
stats = {
    "total_series": 0,
    "already_crawled": 0,
    "crawled_this_run": 0,
    "failed": 0
}


def parse_date(v):
    if not v:
        return None
    try:
        dt = pd.to_datetime(
            str(v),
            format="%Y%m%d",
            errors="coerce"
        )
        if pd.isna(dt):
            return None
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return None


def build_image_url(image_obj):
    if not image_obj:
        return None
    filename = image_obj.get("filename")
    if not filename:
        return None
    return f"https://ranobedb.org/covers/{filename}"


def get_display_name(obj):
    return obj.get("romaji") or obj.get("name")


async def fetch_json(session, url, rate_limit_lock):
    retries = 6

    for attempt in range(retries):
        # If rate_limit_lock is active (e.g. set by another worker), wait
        if rate_limit_lock.locked():
            print("[RATE LIMIT] Waiting for lock to release...")
            await rate_limit_lock.acquire()
            rate_limit_lock.release()

        try:
            async with session.get(url, timeout=60) as response:
                if response.status == 200:
                    return await response.json()

                if response.status == 429:
                    # Explicit rate limit: lock and sleep longer
                    async with rate_limit_lock:
                        wait_time = (2 ** attempt) + random.uniform(5, 10)
                        print(f"[429 TOO MANY REQUESTS] Backing off. Sleeping {wait_time:.1f}s...")
                        await asyncio.sleep(wait_time)
                    continue

                if response.status in [500, 502, 503, 504]:
                    wait_time = (2 ** attempt) + random.uniform(2, 5)
                    print(f"[{response.status} SERVER ERROR] Sleep {wait_time:.1f}s")
                    await asyncio.sleep(wait_time)
                    continue

                print(f"[WARN] Unexpected status {response.status} for {url}")
                return None

        except Exception as e:
            wait_time = (2 ** attempt) + random.uniform(1, 3)
            print(f"[ERROR] Connection issue: {e}. Retrying in {wait_time:.1f}s...")
            await asyncio.sleep(wait_time)

    return None


async def crawl_index_pages(session, max_pages=None, rate_limit_lock=None):
    """Crawls the index to find all series. Yields batches of series metadata."""
    page = 1
    total_pages = 1  # Will be dynamically updated on first page fetch

    while True:
        if max_pages and page > max_pages:
            break
        if page > total_pages:
            break

        print(f"[INDEX] Fetching Page {page} / {total_pages}...")
        url = f"{BASE_URL}/series?page={page}&limit=100"
        data = await fetch_json(session, url, rate_limit_lock)

        if not data:
            print(f"[INDEX ERROR] Failed to fetch index page {page}. Retrying...")
            await asyncio.sleep(2)
            continue

        # Extract total pages dynamically from the first page
        if page == 1:
            try:
                total_pages = int(data.get("totalPages", 1))
                total_count = int(data.get("count", 0))
                print(f"[INDEX INFO] Found {total_count} series across {total_pages} pages.")
                stats["total_series"] = total_count
            except Exception:
                pass

        series_list = data.get("series", [])
        if not series_list:
            break

        rows = []
        for item in series_list:
            rows.append({
                "series_id": item.get("id"),
                "title": item.get("title"),
                "romaji": item.get("romaji"),
                "title_orig": item.get("title_orig"),
                "romaji_orig": item.get("romaji_orig"),
                "lang": item.get("lang"),
                "num_books": item.get("c_num_books")
            })

        yield rows

        page += 1
        await asyncio.sleep(random.uniform(0.3, 0.8))


async def fetch_detail(session, row, rate_limit_lock):
    sid = row["series_id"]
    url = f"{BASE_URL}/series/{sid}"
    response = await fetch_json(session, url, rate_limit_lock)

    if not response:
        return None

    data = response.get("series", {})
    if not data:
        return None

    books = data.get("books", [])
    latest_book = None

    if books:
        latest_book = max(
            books,
            key=lambda x: x.get("c_release_date", 0) or 0
        )

    image_url = build_image_url(
        latest_book.get("image") if latest_book else None
    )

    authors = []
    artists = []

    for s in data.get("staff", []):
        role = (s.get("role_type") or "").lower()
        lang = s.get("lang")
        name = get_display_name(s)

        if not name:
            continue

        # API returns null (None in Python) for original Japanese staff (authors/artists)
        if lang is not None and lang != "ja":
            continue

        if role == "author":
            authors.append(name)

        if role in ["artist", "illustrator"]:
            artists.append(name)

    genres = []
    for tag in data.get("tags", []):
        if tag.get("ttype") == "genre" and tag.get("name"):
            genres.append(tag["name"])

    genre = " | ".join(sorted(set(genres)))

    imprint = None
    publisher = None
    publishers = data.get("publishers", [])

    jp_imprints = [
        p for p in publishers
        if p.get("lang") == "ja"
        and p.get("publisher_type") == "imprint"
    ]

    jp_publishers = [
        p for p in publishers
        if p.get("lang") == "ja"
        and p.get("publisher_type") == "publisher"
    ]

    if jp_imprints:
        imprint = get_display_name(jp_imprints[0])
    elif jp_publishers:
        imprint = get_display_name(jp_publishers[0])

    if jp_publishers:
        publisher = get_display_name(jp_publishers[0])

    return {
        "series_id": row["series_id"],
        "title": row["title"],
        "romaji": row["romaji"],
        "title_orig": row["title_orig"],
        "romaji_orig": row["romaji_orig"],
        "lang": row["lang"],
        "num_books": row["num_books"],
        "description": data.get("description"),
        "aliases": " | ".join(data.get("aliases", []) or []),
        "start_date": parse_date(data.get("start_date")),
        "end_date": parse_date(data.get("end_date")),
        "image_url": image_url,
        "author": " | ".join(sorted(set(authors))),
        "artist": " | ".join(sorted(set(artists))),
        "genre": genre,
        "imprint": imprint,
        "publisher": publisher
    }


async def worker(queue, session, rate_limit_lock, jsonl_file, file_lock):
    """Worker task that processes items from the queue and saves details incrementally."""
    while True:
        row = await queue.get()
        try:
            # Random jitter to keep requests polite
            await asyncio.sleep(random.uniform(0.1, 0.4))

            detail = await fetch_detail(session, row, rate_limit_lock)

            if detail:
                # Thread/Asyncio safe file append
                async with file_lock:
                    with open(jsonl_file, "a", encoding="utf-8") as f:
                        f.write(json.dumps(detail, ensure_ascii=False) + "\n")
                stats["crawled_this_run"] += 1
            else:
                stats["failed"] += 1
                print(f"[FAIL] Could not crawl detail for series ID {row['series_id']}")

            # Log periodic status updates
            completed = stats["already_crawled"] + stats["crawled_this_run"] + stats["failed"]
            if completed % 50 == 0:
                print(f"[STATUS] Progress: {completed} / {stats['total_series']} items processed.")

        except Exception as e:
            stats["failed"] += 1
            print(f"[WORKER EXCEPTION] Error processing series ID {row['series_id']}: {e}")
        finally:
            queue.task_done()


def load_crawled_ids(jsonl_file):
    """Reads the JSONL file and returns a set of already-crawled series IDs."""
    crawled_ids = set()
    if not os.path.exists(jsonl_file):
        return crawled_ids

    print(f"[RESUME] Scanning existing checkpoint file: '{jsonl_file}'...")
    try:
        with open(jsonl_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    item = json.loads(line)
                    if "series_id" in item:
                        crawled_ids.add(item["series_id"])
        print(f"[RESUME] Found {len(crawled_ids)} already-crawled series.")
        stats["already_crawled"] = len(crawled_ids)
    except Exception as e:
        print(f"[RESUME ERROR] Could not read existing checkpoint file: {e}")
    return crawled_ids


def export_to_excel(jsonl_file, excel_file):
    """Converts the JSONL checkpoint file to a clean Excel spreadsheet."""
    print(f"\n[EXPORT] Compiling final results to Excel...")
    if not os.path.exists(jsonl_file):
        print(f"[EXPORT ERROR] Checkpoint file '{jsonl_file}' not found.")
        return

    data = []
    with open(jsonl_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                data.append(json.loads(line))

    if not data:
        print("[EXPORT] No data found in checkpoint file to export.")
        return

    df = pd.DataFrame(data)

    # Format dates to string to prevent Excel display issues
    for date_col in ["start_date", "end_date"]:
        if date_col in df.columns:
            df[date_col] = pd.to_datetime(df[date_col]).dt.strftime('%Y-%m-%d')
            # Replace NaT strings back to None/NaN
            df[date_col] = df[date_col].replace("NaT", None)

    df.to_excel(excel_file, index=False)
    print(f"[EXPORT DONE] Saved {df.shape[0]} rows to '{excel_file}' (Columns: {list(df.columns)})")


async def main():
    parser = argparse.ArgumentParser(description="RanobeDB Fully Optimized Scraper")
    parser.add_argument("--test", action="store_true", help="Run a quick test of the scraper (1 index page, 10 detail requests)")
    parser.add_argument("--concurrency", type=int, default=8, help="Number of concurrent workers (default: 8)")
    parser.add_argument("--output", type=str, default=DEFAULT_OUTPUT_EXCEL, help="Output Excel filename")
    parser.add_argument("--checkpoint", type=str, default=DEFAULT_JSONL_CHECKPOINT, help="JSONL checkpoint file path")
    args = parser.parse_args()

    concurrency = args.concurrency
    if args.test:
        concurrency = 2
        print("[TEST MODE] Running in test mode. Concurrency limited to 2.")

    # Load existing progress
    crawled_ids = load_crawled_ids(args.checkpoint)

    # Create locks
    rate_limit_lock = asyncio.Lock()
    file_lock = asyncio.Lock()

    # Queue to hold series metadata to crawl details
    queue = asyncio.Queue()

    connector = aiohttp.TCPConnector(
        limit=concurrency,
        limit_per_host=4,
        ttl_dns_cache=300
    )
    timeout = aiohttp.ClientTimeout(total=60)

    start_time = time.time()

    async with aiohttp.ClientSession(headers=HEADERS, connector=connector, timeout=timeout) as session:
        # Step 1: Start index crawling and fill queue
        print("\n[INDEX] Starting index crawling...")
        max_pages = 1 if args.test else None

        # Gather workers
        workers = []
        for _ in range(concurrency):
            task = asyncio.create_task(
                worker(queue, session, rate_limit_lock, args.checkpoint, file_lock)
            )
            workers.append(task)

        # Feed the queue dynamically from index pages
        async for index_batch in crawl_index_pages(session, max_pages, rate_limit_lock):
            # If in test mode, only take first 10 items
            if args.test:
                index_batch = index_batch[:10]

            for row in index_batch:
                if row["series_id"] in crawled_ids:
                    continue  # Already crawled, skip queueing

                await queue.put(row)

            # Let workers catch up if queue grows too large, keeping memory consumption low
            while queue.qsize() > 1000:
                await asyncio.sleep(2)

        # Wait for the queue to empty
        print(f"\n[QUEUE] All series items queued. Waiting for workers to finish...")
        await queue.join()

        # Stop workers
        for task in workers:
            task.cancel()
        await asyncio.gather(*workers, return_exceptions=True)

    elapsed_time = time.time() - start_time
    print(f"\n[CRAWL COMPLETED]")
    print(f"Time taken: {elapsed_time:.1f}s")
    print(f"Already crawled: {stats['already_crawled']}")
    print(f"Crawled this run: {stats['crawled_this_run']}")
    print(f"Failed this run: {stats['failed']}")

    # Step 2: Compile Excel sheet from the checkpoint JSONL file
    export_to_excel(args.checkpoint, args.output)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[STOPPED] Execution interrupted by user. Safe to restart to resume later.")
