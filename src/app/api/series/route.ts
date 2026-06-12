// Removed force-dynamic — allow CDN to cache these public responses
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl

  const id       = searchParams.get('id')
  const type     = searchParams.get('type')
  const limit    = parseInt(searchParams.get('limit') || '20')
  const orderBy  = searchParams.get('orderBy') || 'title'
  const asc      = searchParams.get('asc') !== 'false'

  try {
    let query = supabase
      .from('series')
      .select('id, title, cover_url, status, studio, publisher, item_type, anime_meta(mean_score, popularity, season_year, format)')
      .limit(limit)

    if (id)   query = query.eq('id', id)
    if (type) {
      if (type === 'anime') {
        query = query.eq('item_type', 'anime').eq('anime_meta.season_year', 2026)
      } else {
        query = query.eq('item_type', type)
      }
    }

    query = query.order(orderBy, { ascending: asc })

    const { data, error } = await query
    if (error) {
      console.error('[api/series] query failed')
      return NextResponse.json({ error: 'Unable to load series' }, { status: 404 })
    }

    return NextResponse.json({ data }, {
      headers: {
        // Cache 5 min at CDN, serve stale for 1 hour while revalidating
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    })
  } catch (err: any) {
    console.error('[api/series] unexpected failure')
    return NextResponse.json({ error: 'Unable to load series' }, { status: 404 })
  }
}
