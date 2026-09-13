import { NextRequest, NextResponse } from 'next/server'
import { fetchDashboardWatchlistData, fetchDashboardStatsData, fetchDashboardEnrichmentData } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const mode = searchParams.get('mode')

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
        { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      )
    }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      },
    })
  } catch (err: any) {
    console.error('[api/dashboard] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }
}
