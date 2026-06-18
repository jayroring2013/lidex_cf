import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/neonClient'
import { getCloudflareContext } from '@opennextjs/cloudflare'

function checkEnvVar(key: string): boolean {
  if (process.env[key]) return true
  try {
    const ctx = getCloudflareContext()
    const env = ctx?.env as any
    if (env?.[key]) return true
  } catch (e) {}
  return false
}

export async function GET(request: NextRequest) {
  let ctxKeys: string[] = []
  let envKeys: string[] = []
  let cfContextError: string | null = null

  try {
    const ctx = getCloudflareContext()
    if (ctx) {
      ctxKeys = Object.keys(ctx)
      if (ctx.env) envKeys = Object.keys(ctx.env)
    }
  } catch (e) {
    cfContextError = e instanceof Error ? e.message : String(e)
  }

  const env = {
    DATABASE_URL: checkEnvVar('DATABASE_URL'),
    NEXT_PUBLIC_SUPABASE_URL: checkEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: checkEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  }

  const shouldCheckDb = request.nextUrl.searchParams.get('db') === '1'
  if (!shouldCheckDb) {
    return NextResponse.json({
      ok: true,
      env,
      database: 'skipped',
      debug: { ctxKeys, envKeys, cfContextError },
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300',
      },
    })
  }

  try {
    await sql('SELECT 1 as ok')
    return NextResponse.json({
      ok: true,
      env,
      database: 'ok',
      debug: { ctxKeys, envKeys, cfContextError },
    }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      env,
      database: 'error',
      error: error instanceof Error ? error.message : String(error),
      debug: { ctxKeys, envKeys, cfContextError },
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
