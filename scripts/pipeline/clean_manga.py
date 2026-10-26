#!/usr/bin/env python3
"""
scripts/pipeline/clean_manga.py
--------------------------------------------------------------------------------
Purges all Manga records from the Neon PostgreSQL database.
Ensures the database contains only Light Novel data.

Deletes in proper dependency order:
  1. series_user_library (records pointing to manga)
  2. volumes (volumes belonging to manga series)
  3. manga_meta / mangadex_ref (if any exist)
  4. series (where item_type = 'manga')
--------------------------------------------------------------------------------
"""

import os
import sys
import psycopg2
from dotenv import dotenv_values

sys.stdout.reconfigure(encoding='utf-8')


def get_db_connection():
    # 1. Environment variable
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        # 2. Local .env.local file
        env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env.local")
        if os.path.exists(env_path):
            env = dotenv_values(env_path)
            db_url = env.get("DATABASE_URL")

    if not db_url:
        raise RuntimeError("DATABASE_URL is not set in environment or .env.local")

    return psycopg2.connect(db_url)


def clean_manga_data(dry_run: bool = False):
    conn = get_db_connection()
    cur = conn.cursor()

    try:
        # Pre-check counts
        cur.execute("SELECT count(*) FROM series WHERE item_type = 'manga';")
        manga_series_count = cur.fetchone()[0]

        cur.execute("SELECT count(*) FROM volumes WHERE series_id IN (SELECT id FROM series WHERE item_type = 'manga');")
        manga_volumes_count = cur.fetchone()[0]

        cur.execute("SELECT count(*) FROM series_user_library WHERE series_id IN (SELECT id FROM series WHERE item_type = 'manga');")
        manga_library_count = cur.fetchone()[0]

        print("=== Manga Records to Clean ===")
        print(f"  - series (item_type = 'manga'): {manga_series_count}")
        print(f"  - volumes (belonging to manga): {manga_volumes_count}")
        print(f"  - series_user_library (manga):   {manga_library_count}")

        if manga_series_count == 0 and manga_volumes_count == 0 and manga_library_count == 0:
            print("\nDatabase is already completely free of manga data.")
            return

        if dry_run:
            print("\n[DRY RUN] No records were deleted.")
            return

        print("\nDeleting manga records...")

        # 1. User library links
        if manga_library_count > 0:
            cur.execute("DELETE FROM series_user_library WHERE series_id IN (SELECT id FROM series WHERE item_type = 'manga');")
            print(f"  ✓ Deleted {cur.rowcount} records from series_user_library")

        # 2. Volumes
        if manga_volumes_count > 0:
            cur.execute("DELETE FROM volumes WHERE series_id IN (SELECT id FROM series WHERE item_type = 'manga');")
            print(f"  ✓ Deleted {cur.rowcount} records from volumes")

        # 3. Manga meta (if any)
        cur.execute("DELETE FROM manga_meta WHERE series_id IN (SELECT id FROM series WHERE item_type = 'manga');")
        if cur.rowcount > 0:
            print(f"  ✓ Deleted {cur.rowcount} records from manga_meta")

        # 4. Series
        cur.execute("DELETE FROM series WHERE item_type = 'manga';")
        print(f"  ✓ Deleted {cur.rowcount} records from series")

        conn.commit()

        # Post-check verification
        cur.execute("SELECT count(*) FROM series WHERE item_type = 'manga';")
        remaining_manga = cur.fetchone()[0]
        cur.execute("SELECT item_type, count(*) FROM series GROUP BY item_type;")
        breakdown = cur.fetchall()

        print("\n=== Post-Clean Database State ===")
        print(f"  - Remaining manga series: {remaining_manga}")
        print("  - Remaining series breakdown:")
        for item_type, count in breakdown:
            print(f"      • {item_type}: {count}")

        print("\n✓ Successfully cleaned all manga records from Neon DB.")

    except Exception as e:
        conn.rollback()
        print(f"\n[ERROR] Failed to clean manga data: {e}", file=sys.stderr)
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    is_dry = "--dry-run" in sys.argv
    clean_manga_data(dry_run=is_dry)
