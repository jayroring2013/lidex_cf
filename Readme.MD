# LiDex — Vietnamese Light Novel, Manga & Anime Analytics Platform

> **Live Platform**: [wibubros.id.vn](https://wibubros.id.vn)  
> **Authoritative Architecture & Data Mapping Guide**: See [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for full database schemas, page mechanics, API contracts, and table linking rules.

---

## 🌟 Overview

**LiDex** is a web analytics and community platform tracking the Light Novel, Manga, and Anime publishing market in Vietnam. It features:

* 🎲 **Hôm Nay Đọc Gì? (`/what-to-read`)**: CS:GO-style case unboxing game for Light Novels with dynamic composite rarity tiers (Báu vật, Huyền thoại, Sơ cấp, Hiếm, Thông thường) and global StatTrak roll tracking.
* 📊 **Bảng Theo Dõi (`/dashboard`)**: Dead-or-Alive (DOA) publishing status matrix, drop risk percentages, and volume release gap analysis.
* 🏢 **Nhà Phát Hành (`/publisher`)**: Market share treemaps, 24-month publication velocity, and poll history across Vietnamese publishers.
* 🕸️ **Novel Network (`/novel-network`)**: 2D force-directed physics graph connecting Light Novels to their publishers.
* 🔮 **Dự Đoán Bản Quyền (`/license-prediction`)**: Top 1000 unlicensed Light Novel prediction leaderboard with live fan wishlist voting.
* 🏆 **Bảng Xếp Hạng (`/leaderboard`)**: Vietnamese community voting poll archives and leaderboards.
* 📚 **Tủ Sách Cá Nhân (`/bookshelf/[userId]`)**: User collection valuation vs MSRP, series completion rates, and purchase logs.

---

## 🛠️ Tech Stack

* **Frontend**: Next.js 14 (App Router), TypeScript, TailwindCSS, CSS Variables tokens (`src/app/globals.css`).
* **Database**: Neon PostgreSQL (Serverless pooling with `@neondatabase/serverless`).
* **Edge & Hosting**: Cloudflare Pages (`@cloudflare/next-on-pages`), Cloudflare Workers Edge CDN.
* **Authentication**: Supabase Auth (JWT Bearer tokens).
* **Storage & Images**: Cloudflare R2 bucket (`pub-*.r2.dev`) with high-speed direct CDN covers and fallback proxy (`/api/image-proxy`).

---

## 📖 Developer & AI Assistant Documentation

For detailed information on how every page operates, which database queries are executed, and how data tables are linked together, please refer to:

👉 **[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)**

It includes:
1. Complete Entity-Relationship (ER) diagram.
2. Full database table schemas and field types.
3. SQL joining patterns and integer regex casting rules.
4. Page-by-page data flow & UI mechanics.
5. All API routes, methods, and caching configurations.
6. Local Python calendar generator instructions.

---

## 🚀 Development

### Build Check
To avoid Windows SSL/TLS verification issues with system CA certificates:
```powershell
$env:NODE_OPTIONS='--use-system-ca'; npm.cmd run build
```

### Git Workflow
```powershell
git add .
git commit -m "feat/fix: descriptive update"
git push origin main
```
*Cloudflare Pages automatically triggers production builds from branch `main`.*
