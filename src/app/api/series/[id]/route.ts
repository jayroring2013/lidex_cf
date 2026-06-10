import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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

    const { data: series, error: seriesError } = await supabase
      .from('series')
      .select('*')
      .eq('id', seriesId)
      .single()

    if (seriesError || !series) {
      return NextResponse.json(
        { error: `Series with ID ${seriesId} not found` },
        { status: 404 }
      )
    }

    let anime_meta = null
    if (series.item_type === 'anime') {
      const { data, error } = await supabase
        .from('anime_meta')
        .select('*')
        .eq('series_id', seriesId)
        .single()
      
      if (!error && data) anime_meta = data
    }

    let manga_meta = null
    if (series.item_type === 'manga') {
      const { data, error } = await supabase
        .from('manga_meta')
        .select('*')
        .eq('series_id', seriesId)
        .single()
      
      if (!error && data) manga_meta = data
    }

    return NextResponse.json({ ...series, anime_meta, manga_meta })
  } catch (error: any) {
    console.error('API Error')
    return NextResponse.json(
      { error: 'Series not found' },
      { status: 404 }
    )
  }
}
