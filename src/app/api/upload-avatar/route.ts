import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sql } from '@/lib/neonClient'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export const dynamic = 'force-dynamic'

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
  if (!token) return { userId: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  try {
    const client = createUserClient(token)
    const { data, error } = await client.auth.getUser(token)
    if (error || !data.user) return { userId: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
        // Ensure user exists in Neon auth.users (fallback for broken replication)
    await sql(`
      INSERT INTO auth.users (id, email)
      VALUES ($1, $2)
      ON CONFLICT (id) DO NOTHING
    `, [data.user.id, data.user.email || null])

    return { userId: data.user.id, error: null }
  } catch (err) {
    return { userId: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const { userId, error: authError } = await getAuthedUserId(request)
    if (authError || !userId) return authError || NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // 2. Check if user is premium
    const profile = await sql(`SELECT is_premium FROM user_profiles WHERE user_id = $1`, [userId])
    const isPremium = profile.length > 0 && Boolean(profile[0].is_premium)
    if (!isPremium) {
      return NextResponse.json({ error: 'Forbidden: R2 storage is premium-only.' }, { status: 403 })
    }

    // 3. Parse upload file
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'Missing file payload.' }, { status: 400 })
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'Avatar image must be under 2MB.' }, { status: 400 })
    }

    // 4. Access native Cloudflare R2 bucket binding
    const ctx = getCloudflareContext()
    const bucket = (ctx?.env as any)?.AVATARS_BUCKET
    if (!bucket) {
      console.error('[upload-avatar] R2 bucket binding AVATARS_BUCKET is missing')
      return NextResponse.json({ error: 'Cloudflare R2 storage is currently unavailable.' }, { status: 500 })
    }

    // 5. Upload to R2
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const safeExt = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? ext : 'jpg'
    const key = `avatars/${userId}.${safeExt}`
    
    const buffer = await file.arrayBuffer()
    await bucket.put(key, buffer, {
      httpMetadata: {
        contentType: file.type || 'image/jpeg',
        cacheControl: 'public, max-age=31536000, immutable',
      }
    })

    const publicUrl = `https://pub-2080c0fa70954a7e98e48daff887c4cf.r2.dev/${key}`
    return NextResponse.json({ success: true, url: publicUrl })

  } catch (error: any) {
    console.error('[upload-avatar] upload failed:', error)
    return NextResponse.json({ error: error?.message || 'Failed to upload avatar.' }, { status: 500 })
  }
}
