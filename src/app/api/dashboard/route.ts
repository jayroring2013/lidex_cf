import { NextRequest, NextResponse } from 'next/server'
import { fetchDashboardEnrichmentData } from '@/lib/db'

export const revalidate = 0

export async function GET(_req: NextRequest) {
  try {
    const data = await fetchDashboardEnrichmentData()
    if (!data) {
      return NextResponse.json(
        { error: 'Failed to load dashboard data' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      )
    }
    return NextResponse.json(data, {
      headers: {
        // Serve fresh data but allow stale for up to 10 min while revalidating
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800',
      },
    })
  } catch (err: any) {
    console.error('[api/dashboard] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
