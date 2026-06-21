import { NextRequest, NextResponse } from 'next/server'
import { fetchSeriesEnrichmentData } from '@/lib/db'

export const revalidate = 0

export async function GET(req: NextRequest) {
  const url = req.url;
  const cache = typeof caches !== 'undefined' ? (caches as any).default : null;
  if (cache) {
    try {
      const cachedResponse = await cache.match(url);
      if (cachedResponse) return cachedResponse;
    } catch {}
  }

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
    const response = NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=7200',
      },
    })
    if (cache) {
      try { await cache.put(url, response.clone()) } catch {}
    }
    return response
  } catch (err: any) {
    console.error('[api/series-enrichment] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
