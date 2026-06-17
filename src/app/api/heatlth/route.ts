import { NextResponse } from 'next/server'
import { sql } from '@/lib/neonClient'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export const dynamic = 'force-dynamic'

function checkEnvVar(key: string): boolean {
  if (process.env[key]) return true;
  try {
    const ctx = getCloudflareContext()
    const env = ctx?.env as any
    if (env?.[key]) return true;
  } catch (e) {}
  return false;
}

export async function GET() {
  const env = {
    DATABASE_URL: checkEnvVar('DATABASE_URL'),
    NEXT_PUBLIC_SUPABASE_URL: checkEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: checkEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  }

  try {
    await sql('SELECT 1 as ok')
    return NextResponse.json({ ok: true, env, database: 'ok' })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      env,
      database: 'error',
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}

