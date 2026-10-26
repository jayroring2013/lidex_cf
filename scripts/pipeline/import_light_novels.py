#!/usr/bin/env python3
"""
scripts/pipeline/import_light_novels.py
--------------------------------------------------------------------------------
Imports Light Novel data from LN_Sum_from_Kurano.xlsx into Neon PostgreSQL DB:
  1. Evaluates market intelligence rankings via evaluate_rankings.py.
  2. Resolves clean 1-to-1 series mapping to DB series.id (creating new series if needed).
  3. Updates series table with normalized metadata and Cloudflare R2 cover URLs.
  4. Imports all 970 volumes into volumes table with Cloudflare R2 cover URLs.
  5. Upserts all 238 rankings into ln_series_ranking with lidex_series_id FK.
  6. Cleans stale ranking rows not present in LN_Sum_from_Kurano.xlsx.

Usage:
    python scripts/pipeline/import_light_novels.py
    python scripts/pipeline/import_light_novels.py --file="path/to/LN_Sum_from_Kurano.xlsx" --dry-run
--------------------------------------------------------------------------------
"""

import os
import sys
import re
import unicodedata
import argparse
import psycopg2
from psycopg2.extras import execute_values
import pandas as pd
import numpy as np
from dotenv import dotenv_values

sys.stdout.reconfigure(encoding='utf-8')

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from evaluate_rankings import evaluate_dataset
from download_covers import extract_filename_from_url, get_r2_url

DEFAULT_EXCEL = r"C:\Users\ADMIN\Desktop\Web\Organized\LN_Sum_from_Kurano.xlsx"
CF_PUBLIC_URL = "https://pub-2080c0fa70954a7e98e48daff887c4cf.r2.dev"

# Explicit manual overrides for titles that differ in phrasing/subtitles
EXPLICIT_OVERRIDES = {
    "hồi sinh thành quái vật": "remonster---hồi-sinh-thành-quái-vật-2",
    "truyền kỳ phòng bốn chiếu rưỡi": "the-tatami-galaxy---truyền-kỳ-phòng-bốn-chiếu-rưỡi-2",
    "cuộc chiến luân hồi": "cuộc-chiến-luân-hồi---all-you-need-is-kill-2",
    "lycoris recoil - ordinary days": "lycoris-recoil---ordinary-days---tiệm-cà-phê-bất-ổn-2",
    "pháo hoa": "tạm-biệt-pháo-hoa-2",
    "từ tân thế giới": "từ-tân-thế-giới---quyển-trung-2",
    "riku và chise": "riku-và-chise---chàng-trai-phân-chia-thế-giới-và-cô-gái-trong-biệt-thự-2",
    "lớp học điệp viên": "spy-room---lớp-học-điệp-viên-2",
    "cuộc cách mạng ma thuật của công chúa chuyển sinh và tiểu thư thiên tài": "cuộc-cách-mạng-của-công-chúa-chuyển-sinh-và-tiểu-thư-thiên-tài-2",
    "thành phố bị bỏ rơi": "torinoko-city---thành-phố-bị-bỏ-rơi-2",
    "rừng taiga": "rừng-taiga---những-bữa-cơm-đông-âu-của-cặp-vợ-chồng-giả-2",
    "thiếu nữ độc ác và mười hai ánh mắt": "thiếu-nữ-độc-ác-và-mười-hai-ánh-mắt---cuộc-đời-thứ-hai-đầy-huy-hoàng-cùng-những-tùy-tùng-vô-song-2",
    "liệu có sai lầm khi tìm kiếm cuộc gặp gỡ định mệnh trong dungeon?": "liệu-có-sai-lầm-khi-tìm-kiếm-cuộc-gặp-gỡ-định-mệnh-trong-dungeon-2",
    "aura": "aura---trận-chiến-cuối-cùng-của-maryuin-koga-2",
    "thế giới otome game thật khắc nghiệt với nhân vật quần chúng": "thế-giới-otomegame-thật-khắc-nghiệt-với-nhân-vật-quần-chúng-2",
    "nhật ký giấc mơ": "nhật-ký-giấc-mơ-trong-giấc-mơ-của-bạn-tôi-không-tồn-tại-2",
    "suzumiya haruhi": "âm-mưu-của-suzumiya-haruhi-2",
    "sứ giả bốn mùa": "sứ-giả-bốn-mùa---vũ-điệu-mùa-xuân-2",
    "date a live - another route": "date-a-live---another-route-2",
    "86-eighty six - alter": "86-eighty-six---alter-2",
    "86 eighty six": "86-eighty-six-2",
    "mimizuku và vua bóng đêm": "mimizuku-và-vua-bóng-đêm-2",
    "công cuộc tái thiết vương quốc của anh hùng chủ nghĩa hiện thực": "công-cuộc-tái-thiết-vương-quốc-của-anh-hùng-chủ-nghĩa-hiện-thực-2",
}

# Explicit sid overrides for cases where title is identical in Excel but represents distinct series
EXPLICIT_SID_OVERRIDES = {
    8: "your-name---another-side-earthbound-2",
    140: "your-name-2",
}


def get_db_connection():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        env_path = os.path.join(os.path.dirname(os.path.dirname(CURRENT_DIR)), ".env.local")
        if os.path.exists(env_path):
            env = dotenv_values(env_path)
            db_url = env.get("DATABASE_URL")

    if not db_url:
        raise RuntimeError("DATABASE_URL is not set in environment or .env.local")

    return psycopg2.connect(db_url)


def norm_str(s):
    if s is None or pd.isna(s):
        return ""
    return unicodedata.normalize("NFC", str(s).strip().lower())


def norm_title_for_match(text):
    if not text or pd.isna(text):
        return ""
    t = unicodedata.normalize("NFC", str(text).lower())
    t = re.sub(r'[\(\)\[\]\{\}\:–\-\.,\"\'\?\!※]', ' ', t)
    return ' '.join(t.split())


def make_series_key(raw_id, raw_code) -> str:
    if pd.isna(raw_id):
        sid = ""
    elif isinstance(raw_id, float) and raw_id.is_integer():
        sid = str(int(raw_id))
    else:
        sid = str(raw_id).strip()
    code = norm_str(raw_code)
    return f"{sid}|{code}"


def safe_int(v, default=None):
    try:
        if pd.isna(v):
            return default
        return int(float(v))
    except Exception:
        return default


def safe_float(v, default=None):
    try:
        if pd.isna(v):
            return default
        return float(v)
    except Exception:
        return default


def format_r2_cover(url):
    if not url or pd.isna(url):
        return None
    url_str = str(url).strip()
    if not url_str:
        return None
    if "r2.dev" in url_str:
        return url_str
    filename = extract_filename_from_url(url_str)
    if not filename:
        return url_str
    return get_r2_url(filename, CF_PUBLIC_URL)


def run_import(excel_path: str = DEFAULT_EXCEL, dry_run: bool = False):
    print("=" * 80)
    print("LiDex Light Novel Ingestion Pipeline")
    print(f"Source file: {excel_path}")
    print(f"Mode: {'DRY RUN (no database writes)' if dry_run else 'LIVE INGESTION'}")
    print("=" * 80)

    # 1. Evaluate dataset using standard algorithm
    print("\n[Step 1/5] Evaluating market intelligence and ranking metrics...")
    evaluated_df = evaluate_dataset(excel_path)
    print(f"  ✓ Evaluated {len(evaluated_df)} series.")

    # 2. Read Kurano Enriched volumes
    print("\n[Step 2/5] Reading volume data from 'Kurano Enriched'...")
    volumes_df = pd.read_excel(excel_path, sheet_name="Kurano Enriched")
    print(f"  ✓ Loaded {len(volumes_df)} volume rows.")

    # 3. Connect to Database & Load lookup maps
    print("\n[Step 3/5] Connecting to Neon PostgreSQL and resolving series mappings...")
    conn = get_db_connection()
    cur = conn.cursor()

    try:
        # Load publishers
        cur.execute("SELECT id, name FROM publishers;")
        db_publishers = {norm_str(row[1]): row[0] for row in cur.fetchall()}
        print(f"  ✓ Loaded {len(db_publishers)} publishers from DB.")

        # Load existing novel series
        cur.execute("SELECT id, title, slug FROM series WHERE item_type = 'novel';")
        db_series_rows = cur.fetchall()
        db_series_by_slug = {row[2]: row[0] for row in db_series_rows if row[2]}
        db_series_by_norm_title = {norm_title_for_match(row[1]): row[0] for row in db_series_rows}

        # Resolve series mapping: sid / series_key -> series.id
        series_map = {}
        created_series_count = 0

        for idx, row in evaluated_df.iterrows():
            sid = safe_int(row["Series ID"])
            code = str(row["Series Code"]).strip() if pd.notna(row["Series Code"]) else ""
            title = str(row["Series Title"]).strip() if pd.notna(row["Series Title"]) else ""
            n_title = norm_title_for_match(title)
            key = make_series_key(sid, code)

            target_id = None

            # Priority 1: Explicit SID override (e.g. Your Name Earthbound vs Your Name)
            if sid in EXPLICIT_SID_OVERRIDES:
                target_id = db_series_by_slug.get(EXPLICIT_SID_OVERRIDES[sid])

            # Priority 2: Explicit Title override (subtitle variances)
            if not target_id and title.lower() in EXPLICIT_OVERRIDES:
                target_id = db_series_by_slug.get(EXPLICIT_OVERRIDES[title.lower()])

            # Priority 3: Exact normalized NFC title match
            if not target_id:
                target_id = db_series_by_norm_title.get(n_title)

            # Priority 4: Slug match
            if not target_id and code:
                target_id = (
                    db_series_by_slug.get(code)
                    or db_series_by_slug.get(code + "-2")
                    or db_series_by_slug.get(code.replace("-", "---") + "-2")
                )

            # Priority 5: If not found, create brand new series in DB
            if not target_id:
                pub_name = norm_str(row.get("Publisher"))
                pub_id = db_publishers.get(pub_name)
                author = str(row.get("Author", "")).strip() or None
                artist = str(row.get("Artist", "")).strip() or None
                orig_status = str(row.get("Original Status", "")).strip().lower()
                status_val = "completed" if orig_status in ("completed", "complete", "finished", "ended", "完結") else "ongoing"
                new_slug = f"{code}-2" if code else None

                if not dry_run:
                    cur.execute("""
                        INSERT INTO series (
                            item_type, title, title_vi, slug, status, author, artist,
                            publisher_id, genres, tags, created_at, updated_at
                        ) VALUES (
                            'novel', %s, %s, %s, %s, %s, %s, %s,
                            ARRAY['Light Novel'], ARRAY[]::text[], NOW(), NOW()
                        ) RETURNING id;
                    """, (title, title, new_slug, status_val, author, artist, pub_id))
                    target_id = cur.fetchone()[0]
                    if new_slug:
                        db_series_by_slug[new_slug] = target_id
                    db_series_by_norm_title[n_title] = target_id
                    print(f"  ✨ Created new series in DB: '{title}' (ID={target_id}, slug='{new_slug}')")
                    created_series_count += 1
                else:
                    target_id = 999000 + sid
                    print(f"  [DRY RUN] Would create new series in DB: '{title}' (slug='{new_slug}')")
                    created_series_count += 1

            series_map[sid] = target_id
            series_map[str(sid)] = target_id
            series_map[key] = target_id
            if code:
                series_map[code] = target_id

        mapped_unique = len(set(series_map[s] for s in evaluated_df["Series ID"].dropna().astype(int)))
        print(f"  ✓ Successfully mapped {mapped_unique}/{len(evaluated_df)} series to unique series.id in Neon DB.")

        # 4. Ingest / Update Series & Volumes
        print("\n[Step 4/5] Preparing Series & Volume database updates...")

        # Determine volume 1 cover & summary per series
        vol1_map = {}
        sorted_vols = volumes_df.sort_values(by=["Series ID", "Sort Order"])
        for idx, v_row in sorted_vols.iterrows():
            sid = safe_int(v_row.get("Series ID"))
            s_key = make_series_key(v_row.get("Series ID"), v_row.get("Series Code"))
            if sid not in vol1_map:
                cover = format_r2_cover(v_row.get("Cover URL"))
                summary = str(v_row.get("Summary", "")).strip() if pd.notna(v_row.get("Summary")) else ""
                vol1_map[sid] = {"cover_url": cover, "summary": summary}
                vol1_map[s_key] = {"cover_url": cover, "summary": summary}

        # Clear any corrupt cover.jpg entries in series and rankings before updates
        if not dry_run:
            cur.execute("UPDATE series SET cover_url = NULL WHERE cover_url LIKE '%cover.jpg%';")
            cur.execute("UPDATE ln_series_ranking SET cover_url = NULL WHERE cover_url LIKE '%cover.jpg%';")

        # Update Series records
        series_update_count = 0
        for idx, s_row in evaluated_df.iterrows():
            sid = safe_int(s_row["Series ID"])
            target_series_id = series_map.get(sid)
            if not target_series_id:
                continue

            author = str(s_row["Author"]).strip() if pd.notna(s_row.get("Author")) else None
            artist = str(s_row["Artist"]).strip() if pd.notna(s_row.get("Artist")) else None
            pub_name = norm_str(s_row.get("Publisher"))
            pub_id = db_publishers.get(pub_name)

            orig_status = str(s_row.get("Original Status", "")).strip().lower()
            status_val = "completed" if orig_status in ("completed", "complete", "finished", "ended", "完結") else "ongoing"

            v1_info = vol1_map.get(sid, {})
            cover_url = v1_info.get("cover_url")
            summary = v1_info.get("summary")

            if not dry_run:
                cur.execute("""
                    UPDATE series
                    SET 
                        author = COALESCE(%s, author),
                        artist = COALESCE(%s, artist),
                        publisher_id = COALESCE(%s, publisher_id),
                        status = %s,
                        cover_url = COALESCE(%s, cover_url),
                        description_vi = COALESCE(NULLIF(%s, ''), description_vi),
                        updated_at = NOW()
                    WHERE id = %s;
                """, (author, artist, pub_id, status_val, cover_url, summary, target_series_id))
            series_update_count += 1

        print(f"  ✓ Updated {series_update_count} records in 'series' table.")

        # Ingest Volumes
        print("  Processing 970 volumes with Cloudflare R2 cover URLs...")
        seen_volumes = {}  # (series_id, vol_num) -> count
        volume_records = []

        for idx, v_row in volumes_df.iterrows():
            sid = safe_int(v_row.get("Series ID"))
            code = norm_str(v_row.get("Series Code"))
            key = make_series_key(sid, code)
            target_series_id = series_map.get(sid) or series_map.get(key)
            if not target_series_id:
                print(f"  ⚠️ Volume missing series mapping: sid={sid} title={v_row.get('Title')}")
                continue

            pub_name = norm_str(v_row.get("Publisher"))
            pub_id = db_publishers.get(pub_name)

            title = str(v_row["Title"]).strip() if pd.notna(v_row.get("Title")) else ""
            isbn = str(v_row["ISBN"]).strip() if pd.notna(v_row.get("ISBN")) else None
            price = safe_float(v_row.get("Price"))
            page_count = safe_int(v_row.get("Pages"))
            translator = str(v_row["Translator"]).strip() if pd.notna(v_row.get("Translator")) else None

            # Release Date
            rel_date = None
            if pd.notna(v_row.get("Released At")):
                try:
                    rel_date = pd.to_datetime(v_row["Released At"]).date()
                except Exception:
                    pass

            # Cover URL transformed to direct Cloudflare R2
            cover_url = format_r2_cover(v_row.get("Cover URL"))

            # Volume number & is_special handling
            raw_so = v_row.get("Sort Order")
            so_float = float(raw_so) if pd.notna(raw_so) else 1.0

            # Decimal sort orders (e.g. 6.5) or explicit side stories
            is_decimal = (so_float % 1.0 != 0.0)
            is_side_story = any(kw in title.lower() for kw in ["ngoại truyện", "tuyển tập tình yêu", "phần 2"])
            is_special = is_decimal or is_side_story

            if is_special:
                base_vol = 100 + int(so_float)
            else:
                base_vol = int(so_float)

            pair_key = (target_series_id, base_vol)
            if pair_key in seen_volumes:
                # Collision detected, bump volume number
                vol_num = 200 + int(so_float) + seen_volumes[pair_key]
                is_special = True
                seen_volumes[pair_key] += 1
            else:
                vol_num = base_vol
                seen_volumes[pair_key] = 1

            volume_records.append((
                target_series_id,
                pub_id,
                vol_num,
                title,
                isbn,
                cover_url,
                rel_date,
                price,
                "VND",
                is_special,
                False,  # is_digital
                page_count,
                translator
            ))

        if not dry_run:
            # Delete existing novel volumes to ensure clean, accurate state
            cur.execute("""
                DELETE FROM volumes 
                WHERE series_id IN (SELECT id FROM series WHERE item_type = 'novel');
            """)
            print(f"  ✓ Cleaned existing novel volumes ({cur.rowcount} removed).")

            # Batch insert new volumes
            insert_vol_query = """
                INSERT INTO volumes (
                    series_id, publisher_id, volume_number, title, isbn,
                    cover_url, release_date, price, currency, is_special,
                    is_digital, page_count, translator, created_at
                ) VALUES %s;
            """
            template = "(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())"
            execute_values(cur, insert_vol_query, volume_records, template=template, page_size=200)
            print(f"  ✓ Inserted {len(volume_records)} volumes into 'volumes' table.")

        # 5. Ingest / Upsert ln_series_ranking
        print("\n[Step 5/5] Upserting evaluated rankings into 'ln_series_ranking'...")
        ranking_records = []
        valid_ranking_keys = set()

        for idx, r_row in evaluated_df.iterrows():
            sid = safe_int(r_row["Series ID"])
            sid_str = str(sid)
            code = str(r_row["Series Code"]).strip() if pd.notna(r_row["Series Code"]) else ""
            key = make_series_key(sid, code)
            target_series_id = series_map.get(sid) or series_map.get(key)
            valid_ranking_keys.add((sid_str, code))

            # Latest cover transformed to Cloudflare R2
            latest_cover = format_r2_cover(r_row.get("Cover URL"))

            ranking_records.append((
                str(r_row["Series Title"]).strip() if pd.notna(r_row["Series Title"]) else "",
                sid_str,
                code,
                safe_float(r_row.get("Number of Volumes")),
                safe_float(r_row.get("Average Price")),
                pd.to_datetime(r_row["Max Release At"]).to_pydatetime() if pd.notna(r_row.get("Max Release At")) else None,
                safe_float(r_row.get("Average View Count")),
                str(r_row["Publisher"]).strip() if pd.notna(r_row.get("Publisher")) else "",
                safe_float(r_row.get("Original Volumes")),
                str(r_row["Original Status"]).strip() if pd.notna(r_row.get("Original Status")) else "",
                str(r_row.get("Evalution", "")).strip(),
                str(r_row.get("Evaluation Basis", "")).strip(),
                safe_float(r_row.get("LN Score")),
                str(r_row.get("Trạng thái", "")).strip(),
                safe_float(r_row.get("Khả năng drop (Drop %)")),
                str(r_row.get("Drop % Basis", "")).strip(),
                safe_float(r_row.get("Average Gap Months")),
                safe_float(r_row.get("Months Since Last Release")),
                safe_float(r_row.get("Completion Ratio")),
                str(r_row.get("Publisher Activity", "")).strip(),
                safe_float(r_row.get("Publisher Releases Last 24M")),
                str(r_row.get("Score Components", "")).strip(),
                str(r_row.get("Drop Components", "")).strip(),
                latest_cover,
                str(r_row.get("Cover Source Title", "")).strip() if pd.notna(r_row.get("Cover Source Title")) else "",
                target_series_id,
            ))

        if not dry_run:
            upsert_ranking_query = """
                INSERT INTO ln_series_ranking (
                    series_title, series_id, series_code, number_of_volumes,
                    average_price, max_release_at, average_view_count, publisher,
                    original_volumes, original_status, evalution, evaluation_basis,
                    ln_score, trang_thai, drop_percent, drop_basis,
                    average_gap_months, months_since_last_release, completion_ratio,
                    publisher_activity, publisher_releases_last_24m, score_components,
                    drop_components, cover_url, cover_source_title, lidex_series_id,
                    updated_at
                ) VALUES %s
                ON CONFLICT (series_id, series_code) DO UPDATE SET
                    series_title = EXCLUDED.series_title,
                    number_of_volumes = EXCLUDED.number_of_volumes,
                    average_price = EXCLUDED.average_price,
                    max_release_at = EXCLUDED.max_release_at,
                    average_view_count = EXCLUDED.average_view_count,
                    publisher = EXCLUDED.publisher,
                    original_volumes = EXCLUDED.original_volumes,
                    original_status = EXCLUDED.original_status,
                    evalution = EXCLUDED.evalution,
                    evaluation_basis = EXCLUDED.evaluation_basis,
                    ln_score = EXCLUDED.ln_score,
                    trang_thai = EXCLUDED.trang_thai,
                    drop_percent = EXCLUDED.drop_percent,
                    drop_basis = EXCLUDED.drop_basis,
                    average_gap_months = EXCLUDED.average_gap_months,
                    months_since_last_release = EXCLUDED.months_since_last_release,
                    completion_ratio = EXCLUDED.completion_ratio,
                    publisher_activity = EXCLUDED.publisher_activity,
                    publisher_releases_last_24m = EXCLUDED.publisher_releases_last_24m,
                    score_components = EXCLUDED.score_components,
                    drop_components = EXCLUDED.drop_components,
                    cover_url = EXCLUDED.cover_url,
                    cover_source_title = EXCLUDED.cover_source_title,
                    lidex_series_id = EXCLUDED.lidex_series_id,
                    updated_at = NOW();
            """
            template = "(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())"
            execute_values(cur, upsert_ranking_query, ranking_records, template=template, page_size=100)
            print(f"  ✓ Upserted {len(ranking_records)} ranking rows into 'ln_series_ranking'.")

            # Clean stale rankings not present in LN_Sum_from_Kurano.xlsx
            cur.execute("SELECT id, series_id, series_code FROM ln_series_ranking;")
            all_rankings = cur.fetchall()
            stale_ids = [r[0] for r in all_rankings if (str(r[1]).strip(), str(r[2]).strip()) not in valid_ranking_keys]
            if stale_ids:
                cur.execute("DELETE FROM ln_series_ranking WHERE id = ANY(%s);", (stale_ids,))
                print(f"  ✓ Purged {len(stale_ids)} stale rankings not in LN_Sum_from_Kurano.xlsx.")

            conn.commit()
            print("\n🎉 [SUCCESS] Ingestion completed and committed successfully!")
        else:
            print(f"\n[DRY RUN] All {len(ranking_records)} records validated successfully. No changes made to DB.")

    except Exception as e:
        conn.rollback()
        print(f"\n❌ [ERROR] Ingestion failed: {e}", file=sys.stderr)
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import Light Novel data into Neon DB")
    parser.add_argument("--file", default=DEFAULT_EXCEL, help="Path to LN_Sum_from_Kurano.xlsx")
    parser.add_argument("--dry-run", action="store_true", help="Preview without making DB writes")
    args = parser.parse_args()

    run_import(excel_path=args.file, dry_run=args.dry_run)
