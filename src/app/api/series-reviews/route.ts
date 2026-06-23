import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sql } from '@/lib/neonClient'

export const dynamic = 'force-dynamic'

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
  if (!token) return { userId: null, error: null } // Allow optional auth for GET requests

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

export async function GET(request: NextRequest) {
  try {
    const seriesId = Number(request.nextUrl.searchParams.get('seriesId'))
    if (!Number.isInteger(seriesId) || seriesId <= 0) return jsonError('Not found', 404)

    // Optional auth: if token is present, get the user ID to check if they liked the review
    const { userId } = await getAuthedUserId(request)
    const authedUserId = userId || '00000000-0000-0000-0000-000000000000' // safe fallback UUID for standard query parameter

    const reviews = await sql(`
      SELECT 
        r.id,
        r.series_id,
        r.user_id,
        r.content,
        r.created_at,
        p.display_name,
        p.avatar_url,
        l.rating as user_rating,
        (SELECT COUNT(*)::int FROM series_review_likes WHERE review_id = r.id) as likes_count,
        EXISTS(SELECT 1 FROM series_review_likes WHERE review_id = r.id AND user_id = $2) as is_liked
      FROM series_reviews r
      LEFT JOIN user_profiles p ON r.user_id = p.user_id
      LEFT JOIN series_user_library l ON r.series_id = l.series_id AND r.user_id = l.user_id
      WHERE r.series_id = $1
      ORDER BY r.created_at DESC
    `, [seriesId, authedUserId])

    return NextResponse.json({ data: reviews }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    console.error('[series-reviews] GET unexpected failure:', error)
    return jsonError('Unable to load reviews', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, error: authError } = await getAuthedUserId(request)
    if (authError || !userId) return authError || jsonError('Unauthorized', 401)

    const body = await request.json()
    const seriesId = Number(body.seriesId)
    const content = body.content ? String(body.content).trim() : ''

    if (!Number.isInteger(seriesId) || seriesId <= 0) return jsonError('Not found', 404)
    if (!content) return jsonError('Content cannot be empty', 400)
    if (content.length > 2000) return jsonError('Comment exceeds maximum length', 400)

    const result = await sql(`
      INSERT INTO series_reviews (series_id, user_id, content, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING id, created_at
    `, [seriesId, userId, content])

    return NextResponse.json({ ok: true, id: result[0].id, created_at: result[0].created_at }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    console.error('[series-reviews] POST unexpected failure:', error)
    return jsonError('Unable to save review', 500)
  }
}
