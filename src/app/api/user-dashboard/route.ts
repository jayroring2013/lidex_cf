import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function getBearerToken(request: NextRequest) {
  const auth = request.headers.get('authorization') || ''
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : null
}

function createUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  )
}

async function getAuthedUser(request: NextRequest) {
  const token = getBearerToken(request)
  if (!token) return { client: null, userId: null, error: jsonError('Unauthorized', 401) }

  const client = createUserClient(token)
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) return { client: null, userId: null, error: jsonError('Unauthorized', 401) }

  return { client, userId: data.user.id, error: null }
}

function normalizeVolumeIds(input: unknown) {
  if (!Array.isArray(input)) return null
  const ids = Array.from(new Set(input.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0)))
  return ids.slice(0, 5000)
}

export async function GET(request: NextRequest) {
  try {
    const { client, userId, error: authError } = await getAuthedUser(request)
    if (authError || !client || !userId) return authError || jsonError('Unauthorized', 401)

    const { data: libraryRows, error: libraryError } = await client
      .from('series_user_library')
      .select('series_id, rating, status, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (libraryError) {
      console.error('[user-dashboard] rating read failed')
      return jsonError('Unable to load dashboard', 404)
    }

    const { data: purchaseRows, error: purchaseError } = await client
      .from('series_user_volume_purchases')
      .select('volume_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    const bookshelfAvailable = !purchaseError
    if (purchaseError) console.error('[user-dashboard] bookshelf read skipped')

    const volumeIds = (purchaseRows || []).map(row => Number(row.volume_id)).filter(Boolean)
    const librarySeriesIds = (libraryRows || []).map(row => Number(row.series_id)).filter(Boolean)

    const { data: volumeRows, error: volumeError } = volumeIds.length
      ? await client
          .from('volumes')
          .select('id, series_id, volume_number, title, price, currency, cover_url, release_date')
          .in('id', volumeIds)
      : { data: [], error: null }

    if (volumeError) console.error('[user-dashboard] volume read skipped')

    const seriesIds = Array.from(new Set([
      ...librarySeriesIds,
      ...(volumeRows || []).map(row => Number(row.series_id)).filter(Boolean),
    ]))

    const { data: seriesRows, error: seriesError } = seriesIds.length
      ? await client
          .from('series')
          .select('id, title, title_vi, title_native, cover_url, slug, item_type, status')
          .in('id', seriesIds)
      : { data: [], error: null }

    if (seriesError) console.error('[user-dashboard] series read skipped')

    const seriesById = new Map((seriesRows || []).map((series: any) => [Number(series.id), series]))
    const volumesById = new Map((volumeRows || []).map((volume: any) => [Number(volume.id), volume]))

    const purchases = (purchaseRows || [])
      .map((purchase: any) => {
        const volume = volumesById.get(Number(purchase.volume_id))
        if (!volume) return null
        const series = seriesById.get(Number(volume.series_id)) || null
        return {
          volumeId: Number(volume.id),
          seriesId: Number(volume.series_id),
          volumeNumber: volume.volume_number,
          title: volume.title,
          price: volume.price == null ? null : Number(volume.price),
          currency: volume.currency || 'VND',
          coverUrl: volume.cover_url || series?.cover_url || null,
          releaseDate: volume.release_date,
          series: series ? {
            id: Number(series.id),
            title: series.title,
            titleVi: series.title_vi,
            titleNative: series.title_native,
            coverUrl: series.cover_url,
            slug: series.slug,
            itemType: series.item_type,
            status: series.status,
          } : null,
        }
      })
      .filter(Boolean)

    const ratedList = (libraryRows || []).map((entry: any) => {
      const series = seriesById.get(Number(entry.series_id)) || null
      return {
        seriesId: Number(entry.series_id),
        rating: entry.rating == null ? null : Number(entry.rating),
        status: entry.status || null,
        updatedAt: entry.updated_at,
        series: series ? {
          id: Number(series.id),
          title: series.title,
          titleVi: series.title_vi,
          titleNative: series.title_native,
          coverUrl: series.cover_url,
          slug: series.slug,
          itemType: series.item_type,
          status: series.status,
        } : null,
      }
    })

    return NextResponse.json({ purchases, ratedList, bookshelfAvailable })
  } catch (error) {
    console.error('[user-dashboard] unexpected read failure')
    return jsonError('Unable to load dashboard', 404)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { client, userId, error: authError } = await getAuthedUser(request)
    if (authError || !client || !userId) return authError || jsonError('Unauthorized', 401)

    const body = await request.json()
    const volumeIds = normalizeVolumeIds(body.volumeIds)
    if (!volumeIds) return jsonError('Invalid volumes', 400)

    const { error: deleteError } = await client
      .from('series_user_volume_purchases')
      .delete()
      .eq('user_id', userId)

    if (deleteError) {
      console.error('[user-dashboard] purchase clear failed')
      return jsonError('Unable to save bookshelf', 400)
    }

    if (volumeIds.length) {
      const rows = volumeIds.map(volumeId => ({
        user_id: userId,
        volume_id: volumeId,
      }))

      const { error: insertError } = await client
        .from('series_user_volume_purchases')
        .insert(rows)

      if (insertError) {
        console.error('[user-dashboard] purchase save failed')
        return jsonError('Unable to save bookshelf', 400)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[user-dashboard] unexpected write failure')
    return jsonError('Unable to save bookshelf', 400)
  }
}
