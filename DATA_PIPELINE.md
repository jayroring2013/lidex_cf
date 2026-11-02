# LiDex Light Novel Data Ingestion & Market Intelligence Pipeline

## 1. Overview & Architecture

This document serves as the standard operating procedure (SOP) and technical specification for the **LiDex Light Novel Data Pipeline**, covering:
1. Core database ingestion from `LN_Sum_from_Kurano.xlsx` into Neon PostgreSQL.
2. Cloudflare R2 cover image synchronization (`pub-2080c0fa70954a7e98e48daff887c4cf.r2.dev`).
3. Active affiliate link extraction from `Kurano_Affiliate_Parsed.xlsx` into `src/data/series_affiliates.json`.
4. Kurano release mapping from `Kurano_Title_BookID.txt` into `src/data/series_kurano_map.json`.
5. Edge and Service Worker caching pipelines for zero-cost client delivery.

```
                  [ LN_Sum_from_Kurano.xlsx ]        [ Kurano_Affiliate_Parsed.xlsx ]     [ Kurano_Title_BookID.txt ]
                        /            \                          |                                     |
                       /              \                         | (Affiliate Links sheet)             | (allVnTitles edges)
              [ Sheet1 ]       [ Kurano Enriched ]              | (Active Shopee/TikTok)              | (UUID & Slug mapping)
             (238 Series)        (970 Volumes)                  v                                     v
                  |                    |            [ series_affiliates.json ]            [ series_kurano_map.json ]
                  v                    v                  (17 series)                           (238 series)
        [ evaluate_rankings.py ] [ download_covers.py ]         |                                     |
      (LN Score, Cadence, Drop)  (s3.kurano.moe)                |                                     |
                  |                    |                        |                                     |
                  |             [ data/covers/ ]                |                                     |
                  |                    |                        |                                     |
                  |          [ upload_covers_to_r2.py ]         |                                     |
                  \                    /                        |                                     |
                   \                  /                         |                                     |
                    v                v                          |                                     |
               [ import_light_novels.py ]                       |                                     |
                           |                                    |                                     |
         +-----------------+-----------------+                  |                                     |
         |                                   |                  |                                     |
         v                                   v                  v                                     v
 [ Neon PostgreSQL ]                [ Cloudflare R2 ]   +-----------------------------------------------------+
   - series (item_type='novel')       - lidex-covers/   |             Next.js Client Components               |
   - volumes (970 volumes)              covers/<uuid>   | - / (What to Read Unboxing Game)                    |
   - ln_series_ranking (FK mapped)      .jpg            | - /content/[id] (Series Detail & External Links)    |
                                                        | - /collage (20-Box Light Novel Collage Generator)   |
                                                        +-----------------------------------------------------+
```

---

## 2. Directory Structure & Script Index

All pipeline scripts are centralized under `scripts/pipeline/` with companion static datasets under `src/data/`:

| File | Purpose |
| :--- | :--- |
| [`scripts/pipeline/run_pipeline.py`](file:///scripts/pipeline/run_pipeline.py) | **Unified CLI Orchestrator** for executing individual or end-to-end database pipeline stages. |
| [`scripts/pipeline/clean_manga.py`](file:///scripts/pipeline/clean_manga.py) | Purges legacy manga records to keep the database Light Novel-focused. |
| [`scripts/pipeline/download_covers.py`](file:///scripts/pipeline/download_covers.py) | Concurrently downloads volume cover images from `s3.kurano.moe` to local `data/covers/`. |
| [`scripts/pipeline/upload_covers_to_r2.py`](file:///scripts/pipeline/upload_covers_to_r2.py) | Uploads downloaded covers to Cloudflare R2 bucket (`lidex-covers/covers/`). |
| [`scripts/pipeline/evaluate_rankings.py`](file:///scripts/pipeline/evaluate_rankings.py) | Computes release cadence, algorithmic LN Score (0.0–10.0), and drop probability. |
| [`scripts/pipeline/import_light_novels.py`](file:///scripts/pipeline/import_light_novels.py) | Ingests and upserts `series`, `volumes`, and `ln_series_ranking` into Neon DB. |
| [`src/data/series_affiliates.json`](file:///src/data/series_affiliates.json) | Active Shopee/TikTok affiliate links mapped to series titles. |
| [`src/data/series_kurano_map.json`](file:///src/data/series_kurano_map.json) | Cross-reference map connecting LiDex series IDs and titles to canonical Kurano release URLs. |

---

## 3. Data Sources of Truth

### 3.1. Primary Novel Catalog: `LN_Sum_from_Kurano.xlsx`
* **Path**: `C:\Users\ADMIN\Desktop\Web\Organized\LN_Sum_from_Kurano.xlsx`
* **Sheet 1 (`Sheet1`) — 238 Rows**:
  * Series-level metadata: `Series Title`, `Series ID`, `Series Code`, `Number of Volumes`, `Average Price`, `Max Release At`, `Average View Count`, `Publisher`, `Original Volumes`, `Original Status`, `Author`, `Artist`.
* **Sheet 2 (`Kurano Enriched`) — 970 Rows**:
  * Volume-level metadata: `ID`, `Title`, `Series Title`, `Series ID`, `Series Code`, `Release Type`, `Sort Order`, `Publisher`, `Author`, `Artist`, `Translator`, `Price`, `Pages`, `Summary`, `ISBN`, `Cover URL`, `Released At`, `Kurano Title UUID`.

### 3.2. Affiliate Links Catalog: `Kurano_Affiliate_Parsed.xlsx`
* **Path**: `C:\Users\ADMIN\Desktop\Web\Organized\Kurano_Affiliate_Parsed.xlsx`
* **Sheet `Affiliate Links`**:
  * Contains active affiliate links (`s.shopee.vn`, `vt.tiktok.com`).
  * Columns: `Series Name`, `Volume number`, `The affiliate link for that volume`, `Platform`, `Volume Title`, `Edition`.
* **Ingestion Rules**:
  1. **Active links only**: Legacy `shope.ee` links from sheet `Legacy Shopee (shope.ee)` are omitted because shortlinks expire.
  2. **Latest Volume Priority**: If a series has affiliate links for multiple volumes (e.g. *86* has Ep. 14, *Arya* has Tập 10, *Cuộc Cách Mạng Ma Thuật* has Tập 5), the pipeline selects the link for the **highest volume number**.
  3. **Shopee Preferred**: If links exist on both Shopee and TikTok for a series, Shopee is preferred.
  4. **Output Target**: `src/data/series_affiliates.json`.

### 3.3. Kurano Titles & Books Dump: `Kurano_Title_BookID.txt`
* **Path**: `C:\Users\ADMIN\Desktop\Web\Organized\Kurano_Title_BookID.txt`
* **Format**: GraphQL JSON dump containing 243 title nodes (`allVnTitles.edges`) and 973 book nodes (`vnBooksByTitleId.edges`).
* **Mapping Strategy**:
  1. **UUID Cross-Reference**: Volume cover URLs stored in `volumes.cover_url` use the pattern `.../covers/<uuid>.jpg`. This `<uuid>` directly matches Kurano's book ID `vnBooksByTitleId.edges.node.id`.
  2. **Canonical Title Normalization**: Vietnamese titles are normalized (diacritics decomposed, punctuation stripped) to match titles where cover UUIDs differ.
  3. **Canonical URL Generation**: Constructs `https://kurano.moe/tap-truyen/{bookId}/{slug}` using the book UUID and slugified title.
  4. **Explicit Overrides**: Explicit mapping for edge cases (e.g. Series 223 *Ác Nữ Nửa Vời - Truyền Kì Hoán Hồn Đổi Xác* $\to$ `https://kurano.moe/tap-truyen/5ecf395c-12b6-40fb-8f3b-d378f90ca1b1/ac-nu-nua-voi-truyen-ki-hoan-hon-doi-xac`).
  5. **Output Target**: `src/data/series_kurano_map.json` (238 series mapped, 97% catalog coverage).

---

## 4. Cloudflare R2 Cover Image Distribution

All volume covers are hosted on the user's Cloudflare R2 bucket to ensure direct CDN delivery without proxy overhead:
* **Bucket**: `lidex-covers`
* **Public Domain**: `https://pub-2080c0fa70954a7e98e48daff887c4cf.r2.dev`
* **Key Format**: `covers/<uuid>.jpg`
* **Client Handling**: In `src/lib/imageProxy.ts`, URLs matching `r2.dev` or `imagedelivery.net` are flagged by `isDirectCdn()` and bypass `/api/image-proxy` entirely.

---

## 5. Caching & Performance Architecture

To maintain zero billing under Cloudflare's Free Tier (100,000 Worker requests/day), all static media and repetitive queries are cached aggressively:

### 5.1. PWA Service Worker Cache-First Engine (`public/sw.js`)
* **Scope**: All image requests (`r2.dev`, `/api/image-proxy`, static templates, `.jpg`, `.png`, `.webp`, `.svg`).
* **Strategy**: Cache-First with a 7-day TTL (`max-age=604800, s-maxage=604800, stale-while-revalidate=86400`).
* **Behavior**: On first visit, images are cached in the browser's `lidex-images-v1` CacheStorage. On subsequent visits, images load in 0ms with zero network requests to Cloudflare Workers or R2.
* **Cache Management**: LRU trimming automatically caps entries at 800 items.

### 5.2. Client-Side Catalog Storage (`sessionStorage`)
* In [`src/app/collage/page.tsx`](file:///src/app/collage/page.tsx), the Light Novel catalog is fetched once and stored in `sessionStorage` (`lidex_collage_catalog_cache_v2`), eliminating API re-fetches during navigation.

### 5.3. Client-Side Canvas Rendering
* Collage image generation is handled 100% inside the browser via HTML5 Canvas. Exporting high-resolution PNG posters incurs zero server compute or egress cost.

---

## 6. Mathematical Evaluation Model

The evaluation engine in [`evaluate_rankings.py`](file:///scripts/pipeline/evaluate_rankings.py) calculates market health metrics:

### A. Cadence & Recency Metrics
1. **$\text{Months Since Last Release}$**:
   $$\text{Months} = \max\left(0, \frac{\text{Today} - \text{Max Release Date}}{30.4375}\right)$$
2. **$\text{Average Gap Months}$**: Mean interval between successive volume releases.
3. **$\text{Recent Gap Months}$**: Interval between the two most recent volumes.
4. **$\text{Effective Gap}$**:
   $$\text{Effective Gap} = 0.4 \times \text{Avg Gap} + 0.6 \times \text{Recent Gap}$$
5. **$\text{Completion Ratio}$**:
   $$\text{Ratio} = \frac{\text{VN Volumes}}{\text{JP Original Volumes}}$$

### B. Algorithmic LN Score (0.0 to 10.0)
* **Completed Series**:
  $\text{Score} = 8.5 + \text{Volume Bonus} + \text{Cadence Bonus}$ (capped at 10.0).
* **Caught Up to JP**:
  $\text{Score} = 8.0 + \text{Volume Bonus} - \text{Stall Penalty}$ (scaled 6.5–9.5).
* **Ongoing Series**:
  $\text{Base} = 7.5 + \text{Cadence Bonus} + \text{Velocity Bonus} - \text{Gap Penalty} - \text{Inactivity Penalty}$.
* **Dead / Dropped Series**:
  $\text{Dead}: 2.5\text{--}4.5$; $\text{Dropped}: 1.0$ (hard floor).

---

## 7. Execution CLI Manual

### 7.1. Run Full End-to-End Pipeline
```bash
python scripts/pipeline/run_pipeline.py --all
```

### 7.2. Dry Run (Preview without DB changes)
```bash
python scripts/pipeline/run_pipeline.py --all --dry-run
```

### 7.3. Run Individual Pipeline Stages
1. **Download Volume Covers**:
   ```bash
   python scripts/pipeline/download_covers.py --workers=16
   ```
2. **Upload Covers to Cloudflare R2**:
   ```bash
   python scripts/pipeline/upload_covers_to_r2.py --workers=16
   ```
3. **Evaluate Rankings & Ingest to Neon DB**:
   ```bash
   python scripts/pipeline/import_light_novels.py
   ```

---

## 8. Verification & Health Checks

Verify database and data mapping integrity:
```bash
python -c "
import psycopg2
from dotenv import dotenv_values
conn = psycopg2.connect(dotenv_values('.env.local')['DATABASE_URL'])
cur = conn.cursor()
cur.execute('SELECT count(*) FROM series WHERE item_type = \'novel\';')
print('Novel series:', cur.fetchone()[0])
cur.execute('SELECT count(*) FROM volumes;')
print('Volumes (expected 970):', cur.fetchone()[0])
cur.execute('SELECT count(*) FROM ln_series_ranking WHERE lidex_series_id IS NOT NULL;')
print('Rankings mapped to series.id (expected 238):', cur.fetchone()[0])
cur.execute('SELECT count(*) FROM ln_series_ranking WHERE lidex_series_id IS NULL;')
print('Unmapped rankings (expected 0):', cur.fetchone()[0])
"
```
Expected output:
* **Novel series**: 247
* **Volumes**: 970
* **Rankings mapped to series.id**: 238 (100% mapped, 0 NULLs)
* **Unmapped rankings**: 0
* **Affiliate series mapped (`series_affiliates.json`)**: 17 active series
* **Kurano series mapped (`series_kurano_map.json`)**: 238 series (97% coverage)
