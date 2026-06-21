import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/neonClient'

export const revalidate = 86400

// GET /api/stats
export async function GET(req: NextRequest) {
  const url = req.url;
  const cache = typeof caches !== 'undefined' ? (caches as any).default : null;
  if (cache) {
    try {
      const cachedResponse = await cache.match(url);
      if (cachedResponse) return cachedResponse;
    } catch {}
  }

  try {
    // 2 queries instead of 5 — one combined COUNT FILTER + one popularity pull
    const [countsRes, popularityRes] = await Promise.all([
      sql(`
        SELECT
          COUNT(*)::int                                        AS total,
          COUNT(*) FILTER (WHERE item_type = 'anime')::int   AS total_anime,
          COUNT(*) FILTER (WHERE item_type = 'manga')::int   AS total_manga,
          COUNT(*) FILTER (WHERE item_type = 'novel')::int   AS total_novels
        FROM series
        WHERE NOT ('Hentai' = ANY(genres))
      `),
      sql(`
        SELECT popularity::int
        FROM anime_meta
        WHERE season_year = 2026 AND popularity IS NOT NULL
        ORDER BY popularity ASC
        LIMIT 500
      `)
    ])

    const counts     = countsRes[0] ?? {}
    const totalSeries = counts.total        ?? 0
    const totalAnime  = counts.total_anime  ?? 0
    const totalManga  = counts.total_manga  ?? 0
    const totalNovels = counts.total_novels ?? 0

    const popularities = popularityRes
      .map((p: any) => p.popularity)
      .filter((p: number | null) => p !== null)

    let popularityStats = {
      min: 500000,
      max: 1000000,
      p50: 600000,
      p75: 750000,
      p90: 900000,
      p95: 950000,
      p99: 990000,
    }

    if (popularities.length > 0) {
      const count = popularities.length
      popularityStats = {
        min: Math.min(...popularities),
        max: Math.max(...popularities),
        p50: popularities[Math.floor(count * 0.50)] || 600000,
        p75: popularities[Math.floor(count * 0.75)] || 750000,
        p90: popularities[Math.floor(count * 0.90)] || 900000,
        p95: popularities[Math.floor(count * 0.95)] || 950000,
        p99: popularities[Math.floor(count * 0.99)] || 990000,
      }
    }

    const response = NextResponse.json({
      totalSeries,
      totalAnime,
      totalManga,
      totalNovels,
      popularityStats,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
    if (cache) {
      try { await cache.put(url, response.clone()) } catch {}
    }
    return response
  } catch (error: any) {
    console.error('API Error in /api/stats:', error)
    return NextResponse.json({ error: 'Unable to load stats' }, { status: 500 })
  }
}
