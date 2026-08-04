import { NextResponse } from 'next/server'
import { fetchNovelNetworkData } from '@/lib/db'

export const revalidate = 21600

export async function GET() {
  try {
    const data = await fetchNovelNetworkData()
    return NextResponse.json({ data }, {
      headers: {
        'Cache-Control': 'public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400'
      }
    })
  } catch (error) {
    console.error('API Error /api/novel-network:', error)
    return NextResponse.json({ error: 'Failed to fetch novel network data' }, { status: 500 })
  }
}
