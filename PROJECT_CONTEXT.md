# LiDex Platform — Project Architecture & Context Guide

This document serves as an authoritative context guide for AI Coding Assistants and developers working on the **LiDex** codebase. It outlines the technology stack, database schemas, page routes, API endpoints, Python tooling, and implementation rules.

---

## 1. Project Overview & Tech Stack

**LiDex** is a web platform and analytics dashboard for Manga, Light Novels, and Anime in Vietnam. It tracks publishing schedules, licensing prediction leaderboards, market statistics, user bookshelves, and interactive network visualizers.

* **Framework**: Next.js 14 (App Router, Server Components & Client Components)
* **Language**: TypeScript (`.ts`, `.tsx`), JavaScript (`.js`)
* **Styling**: Vanilla CSS with Design System Tokens (`src/app/globals.css`), TailwindCSS, Glassmorphism UI
* **Database**: **Neon PostgreSQL** (serverless connection pooled via `@neondatabase/serverless` / `psycopg2`)
* **Authentication**: **Supabase Auth** (Client-side JWT session state, server routes verify `Authorization: Bearer <token>`)
* **Storage & Proxy**: Cloudflare R2 / Pocketbase image proxies (`src/lib/imageProxy.ts`)
* **Local Python Tooling**: Python 3.x, Pillow (PIL), `psycopg2` for calendar generation & local DB sync

---

## 2. Neon Database Architecture & Schemas

The database is hosted on **Neon PostgreSQL**. Key tables and views include:

### Core Tables
1. **`series`**: Core record for all media items.
   - `id`: integer (Primary Key)
   - `title`: string (Original/English title)
   - `title_vi`: string (Vietnamese localized title)
   - `title_native`: string (Japanese/Native title)
   - `slug`: string (URL slug)
   - `cover_url`, `banner_url`: image URLs
   - `status`: string (`'Ongoing'`, `'Completed'`, `'Hiatus'`, etc.)
   - `genres`: text array (`['Fantasy', 'Isekai', ...]`)
   - `item_type`: string (`'anime'`, `'manga'`, `'novel'`)
   - `publisher_id`: integer (Foreign key to `publishers`)

2. **`volumes`**: Individual volume release records.
   - `id`: integer (Primary Key)
   - `series_id`: integer (FK to `series`)
   - `publisher_id`: integer (FK to `publishers`)
   - `volume_number`: float / int
   - `title`: string (Volume title)
   - `release_date`: date / timestamp
   - `price`: numeric / integer (VND)
   - `cover_url`: string

3. **`publishers`**: Vietnamese publishing houses.
   - `id`: integer (Primary Key)
   - `name`: string (e.g., `'Kim Đồng'`, `'IPM'`, `'Hikari'`, `'NXB Trẻ'`)
   - `name_vi`: string (Vietnamese display name)
   - `logo_url`: string

4. **Metadata Tables**:
   - **`novel_meta`**: `series_id`, `volume_count`, `is_completed`, `updated_at`.
   - **`manga_meta`**: `series_id`, `demographic`, `original_language`, `vn_licensed`, `vn_publisher_id`.
   - **`anime_meta`**: `series_id`, `trending`, `mean_score`, `popularity`, `format`, `episodes`, `season`, `season_year`.

5. **Licensing & Wishlist Tables**:
   - **`ln_series_ranking`**: Light Novel market prediction leaderboard data (ranking scores, publisher likelihood, evaluation factors).
   - **`license_wishlist`**: Fan wishlist voting table.
     ```sql
     CREATE TABLE license_wishlist (
       id SERIAL PRIMARY KEY,
       user_id TEXT NOT NULL,
       series_title TEXT NOT NULL,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       UNIQUE (user_id, series_title)
     );
     ```

6. **User Library & Social Tables**:
   - **`user_profiles`**: `user_id`, `display_name`, `avatar_url`, `is_premium`, `premium_tier`.
   - **`series_user_library`**: User series ratings, status tracking (`reading`, `completed`, `plan_to_read`).
   - **`series_user_volume_purchases`**: User bookshelf volume collection & purchase logs.
   - **`series_reviews`** & **`series_review_likes`**: Community reviews and likes.

---

## 3. Application Structure & Pages

All pages are located under [`src/app`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/app):

* **`/`** ([`page.tsx`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/app/page.tsx)): Home dashboard featuring site statistics, trending anime/manga/novels, top rated titles, and recent volume releases.
* **`/novel-network`** ([`page.tsx`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/app/novel-network/page.tsx)): Interactive force-directed canvas network graph ([`NovelNetworkClient.tsx`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/app/novel-network/NovelNetworkClient.tsx)) mapping Light Novel titles, publishers, market share progress bars, and volume stats.
* **`/license-prediction`** ([`page.tsx`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/app/license-prediction/page.tsx)): Top 1000 Light Novel prediction leaderboard with `% Coming`, `% Success`, column toggles, and live wishlist heart button toggles.
* **`/bookshelf/[userId]`** ([`PublicBookshelfClient.tsx`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/app/bookshelf/%5BuserId%5D/PublicBookshelfClient.tsx)): Public user bookshelf showcasing owned volumes, collection statistics, and average spending comparisons.
* **`/browse`**: Media discovery grid filtering across Light Novels, Manga, and Anime.
* **`/content/[id]`**: Detailed page for a specific series.
* **`/board`**, **`/charts`**, **`/compare`**, **`/leaderboard`**, **`/studio`**, **`/table`**, **`/user`**: Secondary analytics and user management tools.

---

## 4. API Endpoints (`src/app/api/`)

* **`GET /api/wishlist`**: Returns global wishlist vote counts for all series and the list of titles wishlisted by the current authenticated user.
* **`POST /api/wishlist`**: Accepts `{ series_title }` in body and toggles (adds or deletes) the vote for the authenticated user session.
* **`GET /api/novel-network`**: Delivers graph node/link payload for the Light Novel network diagram with `Cache-Control` edge caching.
* **`GET /api/series`**, **`GET /api/series/[id]`**: Series data lookup.
* **`GET /api/stats`**, **`GET /api/leaderboard`**, **`GET /api/dashboard`**: Platform statistics and leaderboard data.

---

## 5. Key Source Modules

* [`src/lib/db.ts`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/lib/db.ts): Server database access layer containing raw SQL queries (`getSiteStats`, `getTrendingSeries`, `fetchNovelNetworkData`, `fetchPublicBookshelfData`, etc.).
* [`src/lib/neonClient.ts`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/lib/neonClient.ts): Connection manager for Neon PostgreSQL serverless SQL execution.
* [`src/lib/cachedDb.ts`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/lib/cachedDb.ts): Server-side `unstable_cache` wrappers for Next.js Data Cache revalidation.
* [`src/lib/imageProxy.ts`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/lib/imageProxy.ts): URL proxy helper to handle remote image caching and fallback CDN links.
* [`src/components/Navbar.tsx`](file:///c:/Users/ADMIN/Desktop/Web/Current%20web/New%20folder/New%20folder/src/components/Navbar.tsx): Main site navigation header.

---

## 6. Python Tooling & Scripts

1. **`generate_calendar.py`**:
   - Standalone Python script using **Pillow (PIL)** and `psycopg2`.
   - Queries Light Novel volume releases from Neon DB for a specified week.
   - Bypasses SSL checks to download cover art and publisher logos.
   - Renders high-resolution 1920px Full-HD publishing calendar JPG images (`release_calendar.jpg`).
   - Run via: `python generate_calendar.py --week 2024-27 --limit 18 --out release_calendar.jpg`

2. **`LN_Data/recommend_lns.py`**:
   - Recommendation & licensing prediction script. Writes top 1000 predictions into `src/data/license_predictions.json`.

3. **`ln_up.py`**:
   - Private local database synchronization script (`ON CONFLICT DO UPDATE SET cover_url = EXCLUDED.cover_url`). *Kept untracked locally for developer use.*

---

## 7. Guidelines & Rules for AI Assistants

When modifying this repository, follow these rules:

1. **Do NOT touch `manga_ref` table**: Never alter or attempt database schema changes on `manga_ref`.
2. **Local Python Script `ln_up.py`**: Keep `ln_up.py` modified locally for local DB sync operations, but do NOT force-push or track private credentials.
3. **Authentication Token Passing**: Authenticated API calls forward the Supabase access token in request headers as `Authorization: Bearer <token>`. Route handlers resolve the user via `supabase.auth.getUser(token)`.
4. **Build Verification Command**: Always verify changes by running the Next.js production build command:
   ```powershell
   $env:NODE_OPTIONS='--use-system-ca'; npm.cmd run build
   ```
5. **Git Repository Remote**: Active GitHub repository is `https://github.com/jayroring2013/lidex_cf.git`.
