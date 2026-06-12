import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/stats
export async function GET() {
  try {
    const [seriesCount, animeCount, mangaCount, novelCount] = await Promise.all([
      supabase.from('series').select('*', { count: 'exact', head: true }).not('genres', 'cs', '{"Hentai"}'),
      supabase.from('series').select('anime_meta!inner(season_year)', { count: 'exact', head: true }).eq('item_type', 'anime').eq('anime_meta.season_year', 2026).not('genres', 'cs', '{"Hentai"}'),
      supabase.from('series').select('*', { count: 'exact', head: true }).eq('item_type', 'manga').not('genres', 'cs', '{"Hentai"}'),
      supabase.from('series').select('*', { count: 'exact', head: true }).eq('item_type', 'novel').not('genres', 'cs', '{"Hentai"}')
    ])

    // ✅ Get dynamic popularity distribution from anime_meta (capped at 500 rows)
    const { data: popularityData, error } = await supabase
      .from('anime_meta')
      .select('popularity')
      .eq('season_year', 2026)
      .not('popularity', 'is', null)
      .order('popularity', { ascending: true })
      .limit(500)

    let popularityStats = {
      min: 500000,
      max: 1000000,
      p50: 600000,
      p75: 750000,
      p90: 900000,
      p95: 950000,
      p99: 990000,
    }

    if (!error && popularityData && popularityData.length > 0) {
      const popularities = popularityData.map(p => p.popularity).filter((p): p is number => p !== null)
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
      totalSeries: seriesCount.count || 0,
      totalAnime: animeCount.count || 0,
      totalManga: mangaCount.count || 0,
      totalNovels: novelCount.count || 0,
      popularityStats,
    }, {
      headers: {
        // Cache at CDN for 1 hour; serve stale for 24h while revalidating
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (error: any) {
    console.error('API Error')
    return NextResponse.json({ error: 'Unable to load stats' }, { status: 404 })
  }
}
