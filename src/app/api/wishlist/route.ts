import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sql } from '@/lib/neonClient'

export const dynamic = 'force-dynamic'

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
  if (!token) return { userId: null }

  try {
    const client = createUserClient(token)
    const { data, error } = await client.auth.getUser(token)
    if (error || !data.user) return { userId: null }
    return { userId: data.user.id }
  } catch (err) {
    return { userId: null }
  }
}

export async function GET(request: NextRequest) {
  try {
    // 1. Fetch global counts
    const globalRows = await sql(`
      SELECT series_title, COUNT(*)::int as count 
      FROM license_wishlist 
      GROUP BY series_title
    `)
    const globalWishlistCounts: Record<string, number> = {}
    globalRows.forEach(row => {
      globalWishlistCounts[row.series_title] = row.count
    })

    // 2. Fetch user wishlisted titles (if logged in)
    const userId = (await getAuthedUserId(request)).userId
    let wishlistedTitles: string[] = []
    if (userId) {
      const userRows = await sql(`
        SELECT series_title 
        FROM license_wishlist 
        WHERE user_id = $1
      `, [userId])
      wishlistedTitles = userRows.map(row => row.series_title)
    }

    return NextResponse.json({ wishlistedTitles, globalWishlistCounts }, {
      headers: { 'Cache-Control': 'no-store' }
    })
  } catch (error: any) {
    console.error('API Error in GET /api/wishlist:', error)
    return NextResponse.json({ error: 'Unable to load wishlist data' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request)
    if (!token) return jsonError('Unauthorized', 401)

    const client = createUserClient(token)
    const { data, error } = await client.auth.getUser(token)
    if (error || !data.user) return jsonError('Unauthorized', 401)
    const userId = data.user.id

    const body = await request.json()
    const { series_title } = body

    if (!series_title) {
      return jsonError('series_title is required', 400)
    }

    // Check if wishlist entry exists
    const existing = await sql(`
      SELECT id FROM license_wishlist 
      WHERE user_id = $1 AND series_title = $2
    `, [userId, series_title])

    if (existing.length > 0) {
      // Remove
      await sql(`
        DELETE FROM license_wishlist 
        WHERE user_id = $1 AND series_title = $2
      `, [userId, series_title])
      return NextResponse.json({ status: 'removed', series_title })
    } else {
      // Add
      await sql(`
        INSERT INTO license_wishlist (user_id, series_title) 
        VALUES ($1, $2)
      `, [userId, series_title])
      return NextResponse.json({ status: 'added', series_title })
    }
  } catch (error: any) {
    console.error('API Error in POST /api/wishlist:', error)
    return NextResponse.json({ error: 'Unable to update wishlist' }, { status: 500 })
  }
}
