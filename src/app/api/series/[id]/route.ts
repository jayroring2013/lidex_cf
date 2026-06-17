import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/neonClient'

// GET /api/series/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const seriesId = parseInt(id)
    
    if (isNaN(seriesId)) {
      return NextResponse.json(
        { error: 'Invalid series ID' },
        { status: 400 }
      )
    }

    const seriesRows = await sql('SELECT * FROM series WHERE id = $1 LIMIT 1', [seriesId])
    const series = seriesRows[0]

    if (!series) {
      return NextResponse.json(
        { error: `Series with ID ${seriesId} not found` },
        { status: 404 }
      )
    }

    let anime_meta = null
    if (series.item_type === 'anime') {
      const metaRows = await sql('SELECT * FROM anime_meta WHERE series_id = $1 LIMIT 1', [seriesId])
      if (metaRows.length > 0) anime_meta = metaRows[0]
    }

    let manga_meta = null
    if (series.item_type === 'manga') {
      const metaRows = await sql('SELECT * FROM manga_meta WHERE series_id = $1 LIMIT 1', [seriesId])
      if (metaRows.length > 0) manga_meta = metaRows[0]
    }

    return NextResponse.json({ ...series, anime_meta, manga_meta })
  } catch (error: any) {
    console.error('API Error in /api/series/[id]:', error)
    return NextResponse.json(
      { error: 'Series not found' },
      { status: 500 }
    )
  }
}
