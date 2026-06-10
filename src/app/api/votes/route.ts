import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/votes?seriesId=123
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const seriesId = searchParams.get('seriesId')

    if (!seriesId) {
      return NextResponse.json({ error: 'seriesId is required' }, { status: 400 })
    }

    const { count, error } = await supabase
      .from('novel_votes')
      .select('*', { count: 'exact', head: true })
      .eq('novel_id', parseInt(seriesId))

    if (error) throw error

    return NextResponse.json({ seriesId, count: count || 0 })
  } catch (error: any) {
    console.error('API Error')
    return NextResponse.json({ error: 'Unable to load votes' }, { status: 404 })
  }
}

// POST /api/votes
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.novel_id) {
      return NextResponse.json({ error: 'novel_id is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('novel_votes')
      .insert([{ novel_id: body.novel_id, created_at: new Date().toISOString() }])
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data, { status: 201 })
  } catch (error: any) {
    console.error('API Error')
    return NextResponse.json({ error: 'Unable to save vote' }, { status: 400 })
  }
}
