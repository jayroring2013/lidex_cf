import { NextRequest, NextResponse } from 'next/server'
import { fetchGlobalRollCount, incrementGlobalRollCount } from '@/lib/db'

export const revalidate = 0

// GET /api/rolls - Fetch global StatTrak roll count
export async function GET() {
  try {
    const totalRolls = await fetchGlobalRollCount()
    return NextResponse.json(
      { totalRolls },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (err: any) {
    console.error('[api/rolls GET] error:', err)
    return NextResponse.json({ totalRolls: 0 }, { status: 500 })
  }
}

// POST /api/rolls - Increment global StatTrak roll count
export async function POST() {
  try {
    const totalRolls = await incrementGlobalRollCount()
    return NextResponse.json(
      { totalRolls },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (err: any) {
    console.error('[api/rolls POST] error:', err)
    return NextResponse.json({ totalRolls: 0 }, { status: 500 })
  }
}
