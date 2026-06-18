import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/neonClient'

export const revalidate = 86400

// GET /api/stats
export async function GET(request: NextRequest) {
  try {
    const [totalSeriesRes, animeCountRes, mangaCountRes, novelCountRes, popularityRes] = await Promise.all([
      sql(`SELECT COUNT(*)::int as count FROM series WHERE NOT ('Hentai' = ANY(genres))`),
      sql(`
        SELECT COUNT(*)::int as count 
        FROM series s 
        JOIN anime_meta a ON s.id = a.series_id 
        WHERE s.item_type = 'anime' AND a.season_year = 2026 AND NOT ('Hentai' = ANY(s.genres))
      `),
      sql(`SELECT COUNT(*)::int as count FROM series WHERE item_type = 'manga' AND NOT ('Hentai' = ANY(genres))`),
      sql(`SELECT COUNT(*)::int as count FROM series WHERE item_type = 'novel' AND NOT ('Hentai' = ANY(genres))`),
      sql(`
        SELECT popularity::int 
        FROM anime_meta 
        WHERE season_year = 2026 AND popularity IS NOT NULL 
        ORDER BY popularity ASC 
        LIMIT 500
      `)
    ])

    const totalSeries = totalSeriesRes[0]?.count ?? 0
    const totalAnime = animeCountRes[0]?.count ?? 0
    const totalManga = mangaCountRes[0]?.count ?? 0
    const totalNovels = novelCountRes[0]?.count ?? 0
    const popularities = popularityRes.map((p: any) => p.popularity).filter((p: number | null) => p !== null)

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

    return NextResponse.json({
      totalSeries,
      totalAnime,
      totalManga,
      totalNovels,
      popularityStats,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch (error: any) {
    console.error('API Error in /api/stats:', error)
    return NextResponse.json({ error: 'Unable to load stats' }, { status: 500 })
  }
}
