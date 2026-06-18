import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sql } from '@/lib/neonClient'

export const dynamic = 'force-dynamic'

const ALLOWED_STATUSES = new Set(['reading', 'dropped', 'planned', 'finished'])
const PRIVATE_HEADERS = { 'Cache-Control': 'no-store' }

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: PRIVATE_HEADERS })
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

export async function GET(request: NextRequest) {
  try {
    const seriesId = Number(request.nextUrl.searchParams.get('seriesId'))
    if (!Number.isInteger(seriesId) || seriesId <= 0) return jsonError('Not found', 404)

    const { userId, error: authError } = await getAuthedUserId(request)
    if (authError || !userId) return authError || jsonError('Unauthorized', 401)

    const rows = await sql(`
      SELECT rating, status 
      FROM series_user_library 
      WHERE series_id = $1 AND user_id = $2 
      LIMIT 1
    `, [seriesId, userId])

    const data = rows[0]

    return NextResponse.json({
      rating: data?.rating == null ? null : Number(data.rating),
      status: data?.status || null,
    }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    console.error('[series-library] unexpected read failure:', error)
    return jsonError('Unable to load rating', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, error: authError } = await getAuthedUserId(request)
    if (authError || !userId) return authError || jsonError('Unauthorized', 401)

    const body = await request.json()
    const seriesId = Number(body.seriesId)
    const rating = body.rating == null ? null : Number(body.rating)
    const status = body.status == null ? null : String(body.status)

    if (!Number.isInteger(seriesId) || seriesId <= 0) return jsonError('Not found', 404)
    if (rating != null && (!Number.isFinite(rating) || rating < 0.5 || rating > 5 || (rating * 2) % 1 !== 0)) {
      return jsonError('Invalid rating', 400)
    }
    if (status != null && !ALLOWED_STATUSES.has(status)) return jsonError('Invalid status', 400)

    await sql(`
      INSERT INTO series_user_library (user_id, series_id, rating, status, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (user_id, series_id) DO UPDATE 
      SET rating = EXCLUDED.rating, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at
    `, [userId, seriesId, rating, status])

    return NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    console.error('[series-library] unexpected write failure:', error)
    return jsonError('Unable to save rating', 500)
  }
}
