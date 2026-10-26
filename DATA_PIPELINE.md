# LiDex Light Novel Data Ingestion & Market Intelligence Pipeline

## 1. Overview & Architecture

This document serves as the standard operating procedure (SOP) and technical specification for the **LiDex Light Novel Data Pipeline**. It defines the exact ingestion workflow, mathematical evaluation model, and Cloudflare R2 image distribution strategy.

Any AI agent or software engineer maintaining or updating the LiDex database should follow this documentation.

```
                            [ LN_Sum_from_Kurano.xlsx ]
                               /                   \
                              /                     \
                      [ Sheet1 ]           [ Kurano Enriched ]
                    (238 Series)              (970 Volumes)
                         |                          |
                         v                          v
             [ evaluate_rankings.py ]      [ download_covers.py ]
          (Cadence, LN Score, Drop Risk)      (s3.kurano.moe)
                         |                          |
                         |                  [ data/covers/ ]
                         |                          |
                         |                  [ upload_covers_to_r2.py ]
                         |                          |
                         \                          /
                          \                        /
                           v                      v
                       [ import_light_novels.py ]
                                   |
                  +----------------+----------------+
                  |                                 |
                  v                                 v
          [ Neon PostgreSQL ]              [ Cloudflare R2 CDN ]
    - series (novel metadata)         - lidex-covers/covers/<uuid>.jpg
    - volumes (970 volumes)           - pub-2080c0fa70954a7e98e48daff887c4cf.r2.dev
    - ln_series_ranking (lidex_series_id FK)
```

---

## 2. Directory Structure

All pipeline scripts are centralized under `scripts/pipeline/`:

| File | Purpose |
| :--- | :--- |
| [`scripts/pipeline/run_pipeline.py`](file:///scripts/pipeline/run_pipeline.py) | **Unified CLI Orchestrator** for executing individual or end-to-end stages. |
| [`scripts/pipeline/clean_manga.py`](file:///scripts/pipeline/clean_manga.py) | Purges all manga records (series, volumes, library links) to keep DB novel-only. |
| [`scripts/pipeline/download_covers.py`](file:///scripts/pipeline/download_covers.py) | Downloads volume cover images from `s3.kurano.moe` to local `data/covers/`. |
| [`scripts/pipeline/upload_covers_to_r2.py`](file:///scripts/pipeline/upload_covers_to_r2.py) | Uploads downloaded covers to Cloudflare R2 (`lidex-covers/covers/`). |
| [`scripts/pipeline/evaluate_rankings.py`](file:///scripts/pipeline/evaluate_rankings.py) | Computes cadence, algorithmic LN Score (0.0–10.0), and drop probability. |
| [`scripts/pipeline/import_light_novels.py`](file:///scripts/pipeline/import_light_novels.py) | Ingests/upserts `series`, `volumes`, and `ln_series_ranking` into Neon DB. |

---

## 3. Data Source of Truth

**File Path**: `C:\Users\ADMIN\Desktop\Web\Organized\LN_Sum_from_Kurano.xlsx`

### Sheet 1: `Sheet1` (Series Level — 238 Rows)
- **Columns**: `Series Title`, `Series ID`, `Series Code`, `Number of Volumes`, `Average Price`, `Max Release At`, `Average View Count`, `Publisher`, `Original Volumes`, `Original Status`, `Author`, `Artist`.
- **Scope**: Single source of truth for licensed Vietnamese Light Novel series and market statistics.

### Sheet 2: `Kurano Enriched` (Volume Level — 970 Rows)
- **Columns**: `ID`, `Title`, `Series Title`, `Series ID`, `Series Code`, `Release Type`, `Selection Rule`, `Sort Order`, `Publisher`, `Author`, `Artist`, `Translator`, `Price`, `Pages`, `Summary`, `ISBN`, `Cover Type`, `Cover URL`, `Released At`, `Kurano Title UUID`.
- **Scope**: Complete list of published volumes with ISBN, translator, pricing, release date, and cover image URLs.

---

## 4. Cloudflare R2 Cover Image Architecture

### Why Cloudflare R2?
To prevent server-side proxy overhead and avoid sending client traffic directly to third-party CDNs (`kurano.moe`), all cover images are downloaded and stored in the user's Cloudflare R2 bucket.

- **Cloudflare Bucket**: `lidex-covers`
- **Public Domain**: `https://pub-2080c0fa70954a7e98e48daff887c4cf.r2.dev`
- **Object Key Format**: `covers/<uuid>.jpg`
  - Extracted from `https://s3.kurano.moe/kurano/vn-releases/<uuid>/image` $\to$ `<uuid>.jpg`.
- **Direct CDN Delivery**:
  - In [`src/lib/imageProxy.ts`](file:///src/lib/imageProxy.ts), URLs matching `r2.dev` satisfy `isDirectCdn() == true`.
  - The Next.js frontend delivers images directly to the client with zero proxy latency.

### Image Download & Upload Workflow
1. **Download**: Run `python scripts/pipeline/download_covers.py`.
   - Downloads all 967 cover images concurrently via `ThreadPoolExecutor` with SSL resilience.
   - Saves them locally to `data/covers/<uuid>.jpg` (git-ignored).
2. **Upload**: Run `python scripts/pipeline/upload_covers_to_r2.py`.
   - Reads R2 credentials from `.env.local` (`CF_ACCOUNT_ID`, `CF_ACCESS_KEY`, `CF_SECRET_KEY`).
   - If credentials are configured, uploads all images to `lidex-covers/covers/` with immutable cache headers.
   - *Manual Alternative*: The `data/covers/` directory can also be uploaded via Cloudflare Dashboard or rclone into `lidex-covers/covers/`.

---

## 5. Database Schema & Constraints

### 1. `series` Table
- `id`: Primary key (mapped 100% to Excel series via `series_key = {Series ID}|{Series Code}`).
- `item_type`: `'novel'` (manga rows purged).
- `status`: Enforced by `series_status_check` (`'ongoing'`, `'completed'`, `'cancelled'`, `'hiatus'`, `'releasing'`).
- `cover_url`: Set to Volume 1's Cloudflare R2 URL.
- `description_vi`: Populated from Volume 1's summary.

### 2. `volumes` Table
- `series_id`: Foreign key pointing to `series(id)`.
- `volume_number`: Integer volume number.
  > [!IMPORTANT]
  > Constraint `volumes_series_vol_uniq UNIQUE (series_id, volume_number)` requires unique volume numbers per series.
  > Special side-story volumes (e.g. *Spy Room Ngoại Truyện*, *Cô Gái Văn Chương Tuyển Tập Tình Yêu*) are assigned `volume_number = 100 + sort_order` and flagged with `is_special = true`.
- `cover_url`: Direct Cloudflare R2 URL: `https://pub-2080c0fa70954a7e98e48daff887c4cf.r2.dev/covers/<uuid>.jpg`.
- `currency`: `'VND'`.

### 3. `ln_series_ranking` Table
- `series_id`, `series_code`: Unique composite key (`ln_series_ranking_unique`).
- `lidex_series_id`: Foreign key pointing directly to `series.id` (**100% mapped, 0 NULLs**).
- `ln_score`: Computed score from 0.0 to 10.0.
- `trang_thai`: Vietnamese status (`Hoàn thành`, `Đang phát hành`, `Đã bắt kịp bản gốc JP`, `Lâu lắm rồi chưa có tập mới`, `Drop`).
- `drop_percent`: Float probability from 0.0 to 1.0.
- `cover_url`: Cloudflare R2 URL of the latest published volume.

---

## 6. Mathematical Evaluation Model

The evaluation engine in [`evaluate_rankings.py`](file:///scripts/pipeline/evaluate_rankings.py) implements the validated LiDex market intelligence formulas:

### A. Cadence & Recency Metrics
1. **$\text{Months Since Last Release}$**:
   $$\text{Months} = \max\left(0, \frac{\text{Today} - \text{Max Release Date}}{30.4375}\right)$$
2. **$\text{Average Gap Months}$**: Mean interval between successive volume releases.
3. **$\text{Recent Gap Months}$**: Gap between the two most recent volume releases.
4. **$\text{Effective Gap}$**:
   $$\text{Effective Gap} = 0.4 \times \text{Avg Gap} + 0.6 \times \text{Recent Gap}$$
5. **$\text{Completion Ratio}$**:
   $$\text{Ratio} = \frac{\text{VN Volumes}}{\text{JP Original Volumes}}$$

### B. Algorithmic LN Score (0.0 to 10.0)
- **Completed Series**:
  - $\text{Score} = 8.5 + \text{Volume Bonus} + \text{Cadence Bonus}$ (capped at 10.0).
- **Caught Up to JP**:
  - $\text{Score} = 8.0 + \text{Volume Bonus} - \text{Stall Penalty}$ (scaled between 6.5 and 9.5).
- **Ongoing Series**:
  - Base: $7.5$
  - Additions: Cadence score, Publisher 24M velocity, Volume volume factor.
  - Deductions: Interval gap penalties, Inactivity penalties.
- **Dead / Dropped Series**:
  - $\text{Dead}$: $2.5$ to $4.5$ based on publisher status.
  - $\text{Dropped}$: $1.0$ (hard floor).

---

## 7. How to Run the Pipeline (CLI Manual)

### Full End-to-End Pipeline
Run all stages (clean manga, download covers, upload to R2, evaluate & import into Neon DB):
```bash
python scripts/pipeline/run_pipeline.py --all
```

### Preview Changes (Dry Run)
Simulate all steps without touching the database:
```bash
python scripts/pipeline/run_pipeline.py --all --dry-run
```

### Run Individual Stages

1. **Purge Manga Records Only**:
   ```bash
   python scripts/pipeline/clean_manga.py
   ```

2. **Download Volume Covers from Kurano**:
   ```bash
   python scripts/pipeline/download_covers.py --workers=16
   ```

3. **Upload Downloaded Covers to Cloudflare R2**:
   ```bash
   python scripts/pipeline/upload_covers_to_r2.py --workers=16
   ```

4. **Evaluate & Ingest Light Novels into Neon DB**:
   ```bash
   python scripts/pipeline/import_light_novels.py
   ```

---

## 8. Verification & Post-Ingestion Checks

Verify database state after running the pipeline:
```bash
python -c "
import psycopg2
from dotenv import dotenv_values
conn = psycopg2.connect(dotenv_values('.env.local')['DATABASE_URL'])
cur = conn.cursor()
cur.execute('SELECT count(*) FROM series WHERE item_type = \'novel\';')
print('Novel series:', cur.fetchone()[0])
cur.execute('SELECT count(*) FROM series WHERE item_type = \'manga\';')
print('Manga series (should be 0):', cur.fetchone()[0])
cur.execute('SELECT count(*) FROM volumes;')
print('Volumes (should be 970):', cur.fetchone()[0])
cur.execute('SELECT count(*) FROM ln_series_ranking WHERE lidex_series_id IS NOT NULL;')
print('Rankings mapped to series.id (should be 238):', cur.fetchone()[0])
cur.execute('SELECT count(*) FROM ln_series_ranking WHERE lidex_series_id IS NULL;')
print('Unmapped rankings (should be 0):', cur.fetchone()[0])
"
```
Expected output:
- **Novel series**: 247 (244 existing + 3 newly created series from Kurano)
- **Manga series**: 0
- **Volumes**: 970
- **Rankings mapped to series.id**: 238 (100% mapped, 238 distinct `lidex_series_id`)
- **Unmapped rankings**: 0
- **Generic 'cover.jpg' references**: 0

### Series Resolution & Cover Alignment Rule
`import_light_novels.py` matches series unambiguously:
1. `EXPLICIT_SID_OVERRIDES`: Distinguishes duplicate Excel titles (e.g. sid 8 = *Your Name Earthbound* vs sid 140 = *Your Name*).
2. `EXPLICIT_OVERRIDES`: Bridges subtitle phrasing variances (e.g. *86 Alter*, *Date A Live Another Route*, *Re:Monster*).
3. `NFC Normalized Title Match`: Matches Unicode-normalized Vietnamese titles.
4. `Slug Match`: Matches normalized series code.
5. `Auto-Create Missing Series`: Inserts new records into `series` table (`item_type = 'novel'`) and retrieves generated `series.id`.
6. `Cover URL Hierarchy`: Evaluated latest volume covers take priority on R2 (`pub-2080c0fa70954a7e98e48daff887c4cf.r2.dev/covers/<uuid>.jpg`), ensuring exact visual alignment with `cover_source_title`.
