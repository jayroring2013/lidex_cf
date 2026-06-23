import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sql } from '@/lib/neonClient'

export const dynamic = 'force-dynamic'

const MAX_USER_LIBRARY_ROWS = 1000
const MAX_USER_VOLUME_IDS = 2000

// Cache global average bookshelf cost for 1 hour to save Neon DB compute hours
let cachedAvgSpending: number | null = null
let lastAvgCacheTime = 0
const AVG_CACHE_DURATION = 3600 * 1000

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
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
        // Ensure user exists in Neon auth.users (fallback for broken replication)
    await sql(`
      INSERT INTO auth.users (id, email)
      VALUES ($1, $2)
      ON CONFLICT (id) DO NOTHING
    `, [data.user.id, data.user.email || null])

    return { userId: data.user.id, error: null }
  } catch (err) {
    return { userId: null, error: jsonError('Unauthorized', 401) }
  }
}

function normalizeVolumeIds(input: unknown) {
  if (!Array.isArray(input)) return null
  const ids = Array.from(new Set(input.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0)))
  return ids.slice(0, MAX_USER_VOLUME_IDS)
}

export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await getAuthedUserId(request)
    if (authError || !userId) return authError || jsonError('Unauthorized', 401)

    // Stage 1: Fetch library rows, purchase rows, and purchased series IDs in parallel
    const [libraryRowsResult, purchaseRowsResult, purchasedSeriesIdsResult] = await Promise.allSettled([
      sql(`
        SELECT series_id, rating, status, updated_at 
        FROM series_user_library 
        WHERE user_id = $1 
        ORDER BY updated_at DESC
        LIMIT $2
      `, [userId, MAX_USER_LIBRARY_ROWS]),
      sql(`
        SELECT volume_id, created_at 
        FROM series_user_volume_purchases 
        WHERE user_id = $1 
        ORDER BY created_at DESC
        LIMIT $2
      `, [userId, MAX_USER_VOLUME_IDS]),
      sql(`
        SELECT DISTINCT v.series_id 
        FROM series_user_volume_purchases p
        JOIN volumes v ON p.volume_id = v.id
        WHERE p.user_id = $1
      `, [userId])
    ])

    const libraryRows = libraryRowsResult.status === 'fulfilled' ? libraryRowsResult.value : []
    let purchaseRows: any[] = []
    let bookshelfAvailable = true
    if (purchaseRowsResult.status === 'fulfilled') {
      purchaseRows = purchaseRowsResult.value
    } else {
      console.error('[user-dashboard] bookshelf read skipped', purchaseRowsResult.reason)
      bookshelfAvailable = false
    }

    const purchasedSeriesIds = purchasedSeriesIdsResult.status === 'fulfilled'
      ? purchasedSeriesIdsResult.value.map(row => Number(row.series_id)).filter(Boolean)
      : []

    const volumeIds = purchaseRows.map(row => Number(row.volume_id)).filter(Boolean)
    const librarySeriesIds = libraryRows.map(row => Number(row.series_id)).filter(Boolean)

    const seriesIds = Array.from(new Set([
      ...librarySeriesIds,
      ...purchasedSeriesIds,
    ]))

    // Stage 2: Fetch volumes details and series details in parallel
    const [volumeRowsResult, seriesRowsResult] = await Promise.allSettled([
      volumeIds.length > 0
        ? sql(`
            SELECT id, series_id, volume_number, title, price, currency, cover_url, release_date 
            FROM volumes 
            WHERE id = ANY($1::int[])
          `, [volumeIds])
        : Promise.resolve([]),
      seriesIds.length > 0
        ? sql(`
            SELECT s.id, s.title, s.title_vi, s.title_native, s.cover_url, s.slug, s.item_type, s.status, p.name as publisher
            FROM series s
            LEFT JOIN publishers p ON s.publisher_id = p.id
            WHERE s.id = ANY($1::int[])
          `, [seriesIds])
        : Promise.resolve([])
    ])

    let volumeRows: any[] = []
    if (volumeRowsResult.status === 'fulfilled') {
      volumeRows = volumeRowsResult.value
    } else {
      console.error('[user-dashboard] volume read skipped', volumeRowsResult.reason)
    }

    let seriesRows: any[] = []
    if (seriesRowsResult.status === 'fulfilled') {
      seriesRows = seriesRowsResult.value
    } else {
      console.error('[user-dashboard] series read skipped', seriesRowsResult.reason)
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
            publisher: series.publisher || null,
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

    // Calculate global average spending with Edge caching
    const now = Date.now()
    if (cachedAvgSpending === null || now - lastAvgCacheTime > AVG_CACHE_DURATION) {
      try {
        const avgRows = await sql(`
          SELECT COALESCE(AVG(total_price), 0) as avg_spending
          FROM (
            SELECT SUM(COALESCE(v.price, 0)) as total_price
            FROM series_user_volume_purchases p
            JOIN volumes v ON p.volume_id = v.id
            GROUP BY p.user_id
          ) t
        `)
        cachedAvgSpending = Number(avgRows[0]?.avg_spending || 0)
        lastAvgCacheTime = now
      } catch (err) {
        console.error('[user-dashboard] failed to calculate average spending:', err)
        cachedAvgSpending = cachedAvgSpending ?? 200000
      }
    }

    return NextResponse.json({
      purchases,
      ratedList,
      bookshelfAvailable,
      avgSpending: cachedAvgSpending
    }, {
      headers: { 'Cache-Control': 'no-store' }
    })
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

    await sql(`
      DELETE FROM series_user_volume_purchases 
      WHERE user_id = $1
    `, [userId])

    if (volumeIds.length > 0) {
      await sql(`
        INSERT INTO series_user_volume_purchases (user_id, volume_id)
        SELECT $1, unnest($2::int[])
      `, [userId, volumeIds])
    }

    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[user-dashboard] unexpected write failure:', error)
    return jsonError('Unable to save bookshelf', 500)
  }
}
