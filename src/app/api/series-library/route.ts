import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const ALLOWED_STATUSES = new Set(['reading', 'dropped', 'planned', 'finished'])

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

export async function GET(request: NextRequest) {
  try {
    const seriesId = Number(request.nextUrl.searchParams.get('seriesId'))
    if (!Number.isInteger(seriesId) || seriesId <= 0) return jsonError('Not found', 404)

    const { client, userId, error: authError } = await getAuthedUser(request)
    if (authError || !client || !userId) return authError || jsonError('Unauthorized', 401)

    const { data, error } = await client
      .from('series_user_library')
      .select('rating, status')
      .eq('series_id', seriesId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('[series-library] read failed')
      return jsonError('Unable to load rating', 404)
    }

    return NextResponse.json({
      rating: data?.rating == null ? null : Number(data.rating),
      status: data?.status || null,
    })
  } catch (error) {
    console.error('[series-library] unexpected read failure')
    return jsonError('Unable to load rating', 404)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { client, userId, error: authError } = await getAuthedUser(request)
    if (authError || !client || !userId) return authError || jsonError('Unauthorized', 401)

    const body = await request.json()
    const seriesId = Number(body.seriesId)
    const rating = body.rating == null ? null : Number(body.rating)
    const status = body.status == null ? null : String(body.status)

    if (!Number.isInteger(seriesId) || seriesId <= 0) return jsonError('Not found', 404)
    if (rating != null && (!Number.isFinite(rating) || rating < 0.5 || rating > 5 || (rating * 2) % 1 !== 0)) {
      return jsonError('Invalid rating', 400)
    }
    if (status != null && !ALLOWED_STATUSES.has(status)) return jsonError('Invalid status', 400)

    const { error } = await client
      .from('series_user_library')
      .upsert({
        user_id: userId,
        series_id: seriesId,
        rating,
        status,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,series_id' })

    if (error) {
      console.error('[series-library] write failed')
      return jsonError('Unable to save rating', 400)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[series-library] unexpected write failure')
    return jsonError('Unable to save rating', 400)
  }
}
