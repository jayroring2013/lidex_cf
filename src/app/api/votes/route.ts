import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/neonClient'

// GET /api/votes?seriesId=123
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const seriesId = searchParams.get('seriesId')

    if (!seriesId) {
      return NextResponse.json({ error: 'seriesId is required' }, { status: 400 })
    }

    const rows = await sql(
      'SELECT COUNT(*)::int as count FROM novel_votes WHERE novel_id = $1',
      [parseInt(seriesId)]
    )
    const count = rows[0]?.count ?? 0

    return NextResponse.json({ seriesId, count })
  } catch (error: any) {
    console.error('API Error in GET /api/votes:', error)
    return NextResponse.json({ error: 'Unable to load votes' }, { status: 500 })
  }
}

// POST /api/votes
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.novel_id) {
      return NextResponse.json({ error: 'novel_id is required' }, { status: 400 })
    }

    const rows = await sql(
      'INSERT INTO novel_votes (novel_id, created_at) VALUES ($1, NOW()) RETURNING *',
      [body.novel_id]
    )
    const data = rows[0]

    return NextResponse.json(data, { status: 201 })
  } catch (error: any) {
    console.error('API Error in POST /api/votes:', error)
    return NextResponse.json({ error: 'Unable to save vote' }, { status: 500 })
  }
}
