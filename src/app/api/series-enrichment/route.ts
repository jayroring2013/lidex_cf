import { NextRequest, NextResponse } from 'next/server'
import { fetchSeriesEnrichmentData } from '@/lib/db'

export const revalidate = 0

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const id = Number(searchParams.get('id'))
  const itemType = searchParams.get('type') || ''

  if (!id || !itemType) {
    return NextResponse.json(
      { error: 'Missing id or type parameter' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  try {
    const data = await fetchSeriesEnrichmentData(id, itemType)
    if (!data) {
      return NextResponse.json(
        { error: 'Failed to load enrichment data' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      )
    }
    return NextResponse.json(data, {
      headers: {
        // Cache enrichment data for 1 hour (it changes rarely)
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    })
  } catch (err: any) {
    console.error('[api/series-enrichment] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
