import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sql } from '@/lib/neonClient'

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

async function getAuthedUserId(request: NextRequest) {
  const token = getBearerToken(request)
  if (!token) return { userId: null, error: jsonError('Unauthorized', 401) }

  try {
    const client = createUserClient(token)
    const { data, error } = await client.auth.getUser(token)
    if (error || !data.user) return { userId: null, error: jsonError('Unauthorized', 401) }
    return { userId: data.user.id, error: null }
  } catch (err) {
    return { userId: null, error: jsonError('Unauthorized', 401) }
  }
}

function normalizeVolumeIds(input: unknown) {
  if (!Array.isArray(input)) return null
  const ids = Array.from(new Set(input.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0)))
  return ids.slice(0, 5000)
}

export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await getAuthedUserId(request)
    if (authError || !userId) return authError || jsonError('Unauthorized', 401)

    // 1. Fetch library rows
    const libraryRows = await sql(`
      SELECT series_id, rating, status, updated_at 
      FROM series_user_library 
      WHERE user_id = $1 
      ORDER BY updated_at DESC
    `, [userId])

    // 2. Fetch purchase rows
    let purchaseRows: any[] = []
    let bookshelfAvailable = true
    try {
      purchaseRows = await sql(`
        SELECT volume_id, created_at 
        FROM series_user_volume_purchases 
        WHERE user_id = $1 
        ORDER BY created_at DESC
      `, [userId])
    } catch (err) {
      console.error('[user-dashboard] bookshelf read skipped', err)
      bookshelfAvailable = false
    }

    const volumeIds = purchaseRows.map(row => Number(row.volume_id)).filter(Boolean)
    const librarySeriesIds = libraryRows.map(row => Number(row.series_id)).filter(Boolean)

    // 3. Fetch volumes
    let volumeRows: any[] = []
    if (volumeIds.length > 0) {
      try {
        volumeRows = await sql(`
          SELECT id, series_id, volume_number, title, price, currency, cover_url, release_date 
          FROM volumes 
          WHERE id = ANY($1::int[])
        `, [volumeIds])
      } catch (err) {
        console.error('[user-dashboard] volume read skipped', err)
      }
    }

    const seriesIds = Array.from(new Set([
      ...librarySeriesIds,
      ...volumeRows.map(row => Number(row.series_id)).filter(Boolean),
    ]))

    // 4. Fetch series details
    let seriesRows: any[] = []
    if (seriesIds.length > 0) {
      try {
        seriesRows = await sql(`
          SELECT id, title, title_vi, title_native, cover_url, slug, item_type, status 
          FROM series 
          WHERE id = ANY($1::int[])
        `, [seriesIds])
      } catch (err) {
        console.error('[user-dashboard] series read skipped', err)
      }
    }

    const seriesById = new Map(seriesRows.map((series: any) => [Number(series.id), series]))
    const volumesById = new Map(volumeRows.map((volume: any) => [Number(volume.id), volume]))

    const purchases = purchaseRows
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

    const ratedList = libraryRows.map((entry: any) => {
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
    console.error('[user-dashboard] unexpected read failure:', error)
    return jsonError('Unable to load dashboard', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, error: authError } = await getAuthedUserId(request)
    if (authError || !userId) return authError || jsonError('Unauthorized', 401)

    const body = await request.json()
    const volumeIds = normalizeVolumeIds(body.volumeIds)
    if (!volumeIds) return jsonError('Invalid volumes', 400)

    // Delete existing purchases for this user
    await sql(`
      DELETE FROM series_user_volume_purchases 
      WHERE user_id = $1
    `, [userId])

    if (volumeIds.length > 0) {
      // Perform batch insert using unnest
      await sql(`
        INSERT INTO series_user_volume_purchases (user_id, volume_id)
        SELECT $1, unnest($2::int[])
      `, [userId, volumeIds])
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[user-dashboard] unexpected write failure:', error)
    return jsonError('Unable to save bookshelf', 500)
  }
}
