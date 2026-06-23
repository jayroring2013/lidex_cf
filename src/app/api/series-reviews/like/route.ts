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

export async function POST(request: NextRequest) {
  try {
    const { userId, error: authError } = await getAuthedUserId(request)
    if (authError || !userId) return authError || jsonError('Unauthorized', 401)

    const body = await request.json()
    const reviewId = Number(body.reviewId)

    if (!Number.isInteger(reviewId) || reviewId <= 0) {
      return jsonError('Invalid review ID', 400)
    }

    // Toggle the like atomically in a single roundtrip to the Neon database
    const result = await sql(`
      WITH delete_like AS (
        DELETE FROM series_review_likes
        WHERE review_id = $1 AND user_id = $2
        RETURNING *
      ),
      insert_like AS (
        INSERT INTO series_review_likes (review_id, user_id)
        SELECT $1, $2
        WHERE NOT EXISTS (SELECT 1 FROM delete_like)
        RETURNING *
      )
      SELECT 
        EXISTS(SELECT 1 FROM insert_like) as liked,
        (SELECT COUNT(*)::int FROM series_review_likes WHERE review_id = $1) as likes_count
    `, [reviewId, userId])

    if (!result || result.length === 0) {
      return jsonError('Unable to update like', 500)
    }

    return NextResponse.json({
      ok: true,
      liked: result[0].liked,
      likesCount: result[0].likes_count
    }, { headers: PRIVATE_HEADERS })

  } catch (error) {
    console.error('[series-reviews/like] POST unexpected failure:', error)
    return jsonError('Unable to update like status', 500)
  }
}
