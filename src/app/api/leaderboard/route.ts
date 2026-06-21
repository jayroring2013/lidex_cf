import { NextRequest, NextResponse } from 'next/server'
import { fetchLeaderboardPeriods, fetchLeaderboardRows, fetchLeaderboardPublishers } from '@/lib/db'

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
      console.warn('[api/leaderboard] Cache match error:', e)
    }
  }

  try {
    if (mode === 'periods') {
      const periods = await fetchLeaderboardPeriods()
      const response = NextResponse.json(periods, {
        headers: {
          'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        },
      })
      if (cache) {
        try { await cache.put(url, response.clone()) } catch {}
      }
      return response
    }

    if (mode === 'rows') {
      const periodId = Number(searchParams.get('periodId'))
      const prevPeriodId = searchParams.get('prevPeriodId') ? Number(searchParams.get('prevPeriodId')) : null

      if (!periodId) {
        return NextResponse.json({ error: 'Missing periodId' }, { status: 400 })
      }

      const periodIds = [periodId, ...(prevPeriodId ? [prevPeriodId] : [])]
      const voteData = await fetchLeaderboardRows(periodIds)
      
      const seriesIds = Array.from(new Set(voteData.map((r: any) => Number(r.series_id)).filter(Boolean)))
      const publisherBySeriesMap = seriesIds.length > 0 
        ? await fetchLeaderboardPublishers(seriesIds)
        : {}

      const response = NextResponse.json({ voteData, publisherBySeriesMap }, {
        headers: {
          'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        },
      })

      if (cache) {
        try { await cache.put(url, response.clone()) } catch {}
      }
      return response
    }

    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  } catch (err: any) {
    console.error('[api/leaderboard] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
