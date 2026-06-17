import { NextResponse } from 'next/server'
import { sql } from '@/lib/neonClient'

export const dynamic = 'force-dynamic'

export async function GET() {
  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
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
