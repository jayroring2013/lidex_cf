// Removed force-dynamic — allow CDN to cache these public responses
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/neonClient'

// Helper to proxy/validate image URLs
function proxyImg(url: string | null): string | null {
  if (!url) return null
  try {
    const h = new URL(url).hostname
    if (!h.includes('supabase') && !h.includes('localhost') && !url.startsWith('/')) {
      return `/api/image-proxy?url=${encodeURIComponent(url)}`
    }
  } catch {}
  return url
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl

  const id       = searchParams.get('id')
  const type     = searchParams.get('type')
  const limit    = parseInt(searchParams.get('limit') || '20')
  const orderBy  = searchParams.get('orderBy') || 'title'
  const asc      = searchParams.get('asc') !== 'false'

  try {
    const params: any[] = []
    let whereClause = '1=1'

    if (id) {
      params.push(Number(id))
      whereClause += ` AND s.id = $${params.length}`
    }

    if (type) {
      if (type === 'anime') {
        whereClause += ` AND s.item_type = 'anime' AND a.season_year = 2026`
      } else {
        params.push(type)
        whereClause += ` AND s.item_type = $${params.length}`
      }
    }

    // Map order by columns to avoid SQL injection
    const allowedOrderBy: Record<string, string> = {
      'title': 's.title',
      'id': 's.id',
      'created_at': 's.created_at',
      'mean_score': 'a.mean_score',
      'popularity': 'a.popularity'
    }
    const orderCol = allowedOrderBy[orderBy] || 's.title'
    const direction = asc ? 'ASC' : 'DESC'

    params.push(limit)
    const limitPlaceholder = `$${params.length}`

    const queryStr = `
      SELECT 
        s.id, s.title, s.cover_url, s.status, s.studio, s.publisher, s.item_type,
        a.mean_score, a.popularity, a.season_year, a.format
      FROM series s
      LEFT JOIN anime_meta a ON s.id = a.series_id
      WHERE ${whereClause}
      ORDER BY ${orderCol} ${direction}
      LIMIT ${limitPlaceholder}
    `

    const rows = await sql(queryStr, params)

    const data = rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      cover_url: proxyImg(r.cover_url),
      status: r.status,
      studio: r.studio,
      publisher: r.publisher,
      item_type: r.item_type,
      anime_meta: r.mean_score !== null || r.popularity !== null ? {
        mean_score: r.mean_score !== null ? Number(r.mean_score) : null,
        popularity: r.popularity !== null ? Number(r.popularity) : null,
        season_year: r.season_year !== null ? Number(r.season_year) : null,
        format: r.format
      } : null
    }))

    return NextResponse.json({ data }, {
      headers: {
        // Cache 1 day at CDN, serve stale for 7 days while revalidating
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch (err: any) {
    console.error('[api/series] unexpected failure:', err)
    return NextResponse.json({ error: 'Unable to load series' }, { status: 500 })
  }
}
