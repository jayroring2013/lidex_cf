import { NextRequest, NextResponse } from 'next/server'
import { fetchDashboardWatchlistData, fetchDashboardStatsData, fetchDashboardEnrichmentData } from '@/lib/db'

export const revalidate = 0

export async function GET(req: NextRequest) {
  const url = req.url
  const { searchParams } = req.nextUrl
  const mode = searchParams.get('mode')

  // Check Cloudflare Edge Cache first
  const cache = typeof caches !== 'undefined' ? (caches as any).default : null
  if (cache) {
    try {
      const cachedResponse = await cache.match(url)
      if (cachedResponse) {
        return cachedResponse
      }
    } catch (e) {
      console.warn('[api/dashboard] Cache match error:', e)
    }
  }

  try {
    let data: any = null
    if (mode === 'watchlist') {
      data = await fetchDashboardWatchlistData()
    } else if (mode === 'stats') {
      data = await fetchDashboardStatsData()
    } else {
      data = await fetchDashboardEnrichmentData()
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Failed to load dashboard data' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    // Cache the response for 24 hours (86400 seconds)
    const response = NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    })

    if (cache) {
      try {
        await cache.put(url, response.clone())
      } catch (e) {
        console.warn('[api/dashboard] Cache put error:', e)
      }
    }

    return response
  } catch (err: any) {
    console.error('[api/dashboard] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
