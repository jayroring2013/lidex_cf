# LiDex Platform — Project Architecture & Database Mapping Guide

This document serves as an authoritative architecture guide for AI Coding Assistants and developers working on the **LiDex** codebase. It explicitly maps every **Neon PostgreSQL database table** to the **React components, Next.js pages, API routes, and Python scripts** that consume it, detailing the exact data flow and columns used.

---

## 1. Executive Summary & Tech Stack

**LiDex** is a web analytics platform for Manga, Light Novels, and Anime in Vietnam. It tracks publishing release schedules, licensing prediction leaderboards, market statistics, user bookshelves, and interactive network visualizers.

* **Framework**: Next.js 14 (App Router with React Server Components & Client Components)
* **Language**: TypeScript (`.ts`, `.tsx`), JavaScript (`.js`)
* **Styling**: Vanilla CSS with Design System Tokens (`src/app/globals.css`), TailwindCSS, Glassmorphism UI
* **Database**: **Neon PostgreSQL** (Serverless SQL pooler via `@neondatabase/serverless` / `psycopg2`)
* **Authentication**: **Supabase Auth** (Client-side JWT session state, server routes verify `Authorization: Bearer <token>`)
* **Image Proxies & Storage**: Cloudflare R2 / Pocketbase image proxy helpers (`src/lib/imageProxy.ts`)
* **Local Tooling**: Python 3.x, Pillow (PIL), `psycopg2` for calendar image generation & local DB sync

---

## 2. Component & API to Database Table Mapping Matrix

The table below outlines which components and API routes consume which Neon database tables:

| Feature / Component | File Location | Database Tables Used | Primary Columns Extracted & Purpose |
| :--- | :--- | :--- | :--- |
| **Novel Network Visualizer** | [`src/app/novel-network/NovelNetworkClient.tsx`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/app/novel-network/NovelNetworkClient.tsx)<br>[`src/app/api/novel-network/route.ts`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/app/api/novel-network/route.ts) | `ln_series_ranking`<br>`series`<br>`publishers` | `ln_series_ranking`: `series_title`, `number_of_volumes`, `ln_score`, `trang_thai`, `publisher`<br>`series`: `cover_url`, `title_vi`, `slug`, `genres`<br>`publishers`: `logo_url`<br>*(Renders force-directed canvas graph connecting publishers to Light Novels)* |
| **Licensing Predictions & Fan Wishlist** | [`src/app/license-prediction/LicensePredictionClient.tsx`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/app/license-prediction/LicensePredictionClient.tsx)<br>[`src/app/api/wishlist/route.ts`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/app/api/wishlist/route.ts) | `license_wishlist`<br>`ln_series_ranking` | `license_wishlist`: `user_id`, `series_title`, `created_at`<br>`ln_series_ranking`: top 1000 Light Novel market evaluation scores<br>*(Renders 1000 items leaderboard with live wishlist vote toggles & fan vote counts)* |
| **Public User Bookshelf** | [`src/app/bookshelf/[userId]/PublicBookshelfClient.tsx`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/app/bookshelf/%5BuserId%5D/PublicBookshelfClient.tsx) | `user_profiles`<br>`series_user_volume_purchases`<br>`series_user_library`<br>`volumes`<br>`series`<br>`publishers` | `user_profiles`: `display_name`, `avatar_url`, `is_premium`<br>`purchases`: `volume_id`, `purchase_price`, `purchase_date`<br>`volumes`: `volume_number`, `title`, `cover_url`<br>`series`: `title`, `title_vi`, `cover_url`<br>*(Calculates user collection value vs system average & displays collection grid)* |
| **Series Content Details** | [`src/app/content/[id]/page.tsx`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/app/content/%5Bid%5D/page.tsx) | `series`<br>`volumes`<br>`publishers`<br>`ln_series_ranking`<br>`voting_results`<br>`voting_periods` | `series`: `id`, `title`, `title_vi`, `cover_url`, `banner_url`<br>`volumes`: `volume_number`, `release_date`, `price`<br>`ln_series_ranking`: market score breakdown<br>*(Renders volume release schedule timeline & score details)* |
| **Homepage & Trending** | [`src/app/page.tsx`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/app/page.tsx)<br>[`src/app/api/stats/route.ts`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/app/api/stats/route.ts) | `series`<br>`anime_meta`<br>`series_rating_summary` | `series`: `id`, `title`, `title_vi`, `item_type`, `genres`, `cover_url`<br>`anime_meta`: `trending`, `mean_score`, `popularity`<br>*(Displays site stats counts, seasonal trending anime, top rated series)* |
| **Catalog Discovery** | [`src/app/browse/page.tsx`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/app/browse/page.tsx) | `series`<br>`manga_meta`<br>`novel_meta`<br>`anime_meta`<br>`publishers` | `series`: `id`, `title`, `status`, `genres`, `item_type`<br>`meta`: `demographic`, `vn_licensed`, `vn_publisher_id`<br>*(Multi-filter search catalog for manga, novels, and anime)* |
| **Poll Leaderboards** | [`src/app/leaderboard/page.tsx`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/app/leaderboard/page.tsx)<br>[`src/app/api/leaderboard/route.ts`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/app/api/leaderboard/route.ts) | `voting_periods`<br>`voting_results`<br>`series`<br>`publishers` | `voting_periods`: `id`, `label`, `year`, `month`<br>`voting_results`: `series_id`, `rank`, `votes`<br>*(Renders community voting poll rankings)* |
| **Publishing Calendar Image Generator** | [`generate_calendar.py`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/generate_calendar.py) | `volumes`<br>`series`<br>`publishers` | `volumes`: `volume_number`, `release_date`, `price`, `cover_url`<br>`series`: `title`, `title_vi`, `author`, `artist`, `item_type`<br>`publishers`: `name`, `name_vi`, `logo_url`<br>*(Renders 1920px Full HD release calendar JPG image)* |

---

## 3. Deep Dive into Database Schemas & Data Structures

### 3.1. `series` (Core Media Records)
The central entity for all titles on the platform.
```sql
SELECT id, title, title_vi, title_native, slug, cover_url, banner_url, status, genres, item_type, publisher_id 
FROM series;
```
* **`item_type`**: Restricted string: `'anime'`, `'manga'`, or `'novel'`.
* **`status`**: String indicating publication status (`'Ongoing'`, `'Completed'`, `'Hiatus'`).
* **`genres`**: Postgres text array `text[]` (e.g. `ARRAY['Fantasy', 'Action', 'Isekai']`).
* **Usage**: Consumed by virtually every page (`/browse`, `/content/[id]`, `/novel-network`, `/bookshelf/[userId]`).

### 3.2. `volumes` (Release Schedule Data)
Contains volume-level release data in Vietnam.
```sql
SELECT id, series_id, publisher_id, volume_number, title, release_date, price, cover_url 
FROM volumes;
```
* **`volume_number`**: Numeric volume index (e.g., `1`, `2`, `2.5`).
* **`price`**: Numeric price in VND (e.g., `95000`, `110000`).
* **`release_date`**: Date/timestamp of official Vietnamese publication.
* **Usage**: Powering volume release timelines on `/content/[id]`, `/board`, user bookshelf value calculation, and `generate_calendar.py`.

### 3.3. `publishers` (Vietnamese Publishing Houses)
Contains official Vietnamese publisher metadata.
```sql
SELECT id, name, name_vi, logo_url FROM publishers;
```
* **`name`**: Standard publisher name (e.g. `'Kim Đồng'`, `'IPM'`, `'Hikari'`, `'NXB Trẻ'`, `'Amak'`).
* **`logo_url`**: Remote URL for publisher logo image.
* **Usage**: Rendered next to volume listings, inside `generate_calendar.py` white card logo boxes, and on publisher network hubs in `/novel-network`.

### 3.4. `ln_series_ranking` (Light Novel Licensing Rankings)
View/table containing evaluation parameters for un-licensed Light Novels.
```sql
SELECT id, series_title, lidex_series_id, publisher, number_of_volumes, original_volumes, original_status, evalution, evaluation_basis, ln_score, trang_thai, average_price, max_release_at, drop_percent, months_since_last_release, cover_url 
FROM ln_series_ranking;
```
* **`ln_score`**: Calculated rating score (e.g. `9.2`).
* **`evalution`**: String evaluation verdict.
* **Usage**: Feeds top 1000 recommendations on `/license-prediction` and node graph data on `/novel-network`.

### 3.5. `license_wishlist` (Fan Wishlist Votes)
Tracks unique fan votes for un-licensed series.
```sql
CREATE TABLE license_wishlist (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  series_title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, series_title)
);
```
* **`user_id`**: Supabase Auth user UUID.
* **`series_title`**: Distinct series title. Enforces one vote per distinct series per user.
* **Usage**: Managed by `/api/wishlist` (GET & POST) to render heart toggles and vote counts on `/license-prediction`.

### 3.6. User Bookshelf & Social Tables
* **`user_profiles`**: `user_id`, `display_name`, `avatar_url`, `is_premium`, `premium_tier`.
* **`series_user_library`**: `user_id`, `series_id`, `status` (`'reading'`, `'completed'`), `user_rating`.
* **`series_user_volume_purchases`**: `user_id`, `volume_id`, `purchase_price`, `purchase_date`.
* **`series_rating_summary`**: `series_id`, `average_rating`, `rating_count`.
* **Usage**: Consumed by `/bookshelf/[userId]` and `/user` profiles.

---

## 4. API Endpoints & Data Flow

### 4.1. Wishlist Endpoint (`/api/wishlist`)
* **`GET /api/wishlist`**:
  1. Executes `SELECT series_title, COUNT(*)::int as count FROM license_wishlist GROUP BY series_title`.
  2. If an `Authorization: Bearer <token>` header is present, resolves the Supabase user and fetches their wishlisted titles: `SELECT series_title FROM license_wishlist WHERE user_id = $1`.
  3. Returns `{ counts: { [series_title]: vote_count }, userWishlist: [ 'Title A', ... ] }`.
* **`POST /api/wishlist`**:
  1. Validates Supabase JWT token from `Authorization` header.
  2. Checks if vote exists: `SELECT id FROM license_wishlist WHERE user_id = $1 AND series_title = $2`.
  3. Toggles vote: deletes if present (`DELETE`), inserts if absent (`INSERT`).

### 4.2. Novel Network Endpoint (`/api/novel-network`)
* **`GET /api/novel-network`**:
  1. Executes `fetchNovelNetworkData()` in `src/lib/db.ts`.
  2. Joins `ln_series_ranking`, `series`, and `publishers`.
  3. Sets `Cache-Control: public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400`.
  4. Returns `{ data: [ NovelNetworkItem, ... ] }`.

---

## 5. Python Tooling & Local Scripts

### 5.1. `generate_calendar.py`
* **Purpose**: Generates high-resolution publishing calendar JPG images.
* **SQL Query**:
  ```sql
  SELECT v.id, v.volume_number, v.release_date, v.price, v.cover_url,
         s.title, s.title_vi, s.author, s.artist, s.item_type,
         p.name as publisher_name, p.name_vi as publisher_name_vi, p.logo_url as publisher_logo_url, p.id as publisher_id
  FROM volumes v
  JOIN series s ON v.series_id = s.id
  LEFT JOIN publishers p ON v.publisher_id = p.id
  WHERE LOWER(s.item_type) = 'novel' AND v.release_date >= $1 AND v.release_date <= $2
  ORDER BY v.release_date ASC
  ```
* **Execution**: `python generate_calendar.py --week 2025-32 --limit 18 --out release_calendar.jpg`
* **Output**: Renders `1920px` Full HD JPG image with cover art thumbnails (`56x80px`) and publisher logos inside white card backings (`34x34px`).

### 5.2. `ln_up.py` *(Local Developer Script)*
* **Purpose**: Local database updater for volume covers.
* **Behavior**: Executes `INSERT INTO ... ON CONFLICT DO UPDATE SET cover_url = EXCLUDED.cover_url` for `series` and `volumes`.

---

## 6. Guidelines & Rules for AI Assistants

1. **Database Safety**: Never alter or drop the `manga_ref` table.
2. **Local Script `ln_up.py`**: Keep `ln_up.py` untracked in Git for local developer usage.
3. **Authentication Header**: Server routes verify user sessions by fetching `Authorization: Bearer <token>` from request headers.
4. **Build Check Command**: Always verify builds using:
   ```powershell
   $env:NODE_OPTIONS='--use-system-ca'; npm.cmd run build
   ```
5. **Git Remote**: Active GitHub repository URL is `https://github.com/jayroring2013/lidex_cf.git`.
