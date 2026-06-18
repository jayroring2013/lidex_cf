import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 604800

const REFERER_MAP: Record<string, string> = {
  'docln.net': 'https://docln.net/',
  'i.docln.net': 'https://docln.net/',
  'i2.docln.net': 'https://docln.net/',
  'hako.re': 'https://docln.net/',
  'i.hako.re': 'https://docln.net/',
  'hako.vn': 'https://docln.net/',
  'i.hako.vn': 'https://docln.net/',
  'hako.vip': 'https://docln.net/',
  'i.hako.vip': 'https://docln.net/',
  'i2.hako.vip': 'https://docln.net/',
  'mangadex.org': 'https://mangadex.org/',
  'uploads.mangadex.org': 'https://mangadex.org/',
  'myanimelist.net': 'https://myanimelist.net/',
  'cdn.myanimelist.net': 'https://myanimelist.net/',
  'anilist.co': 'https://anilist.co/',
  's4.anilist.co': 'https://anilist.co/',
  'img.anili.st': 'https://anilist.co/',
  'kitsu.app': 'https://kitsu.app/',
  'media.kitsu.app': 'https://kitsu.app/',
  'ranobedb.org': 'https://ranobedb.org/',
  'images.ranobedb.org': 'https://ranobedb.org/',
  'ranobe.one': 'https://ranobe.one/',
  'images.ranobe.one': 'https://ranobe.one/',
}

function getReferer(hostname: string): string {
  if (REFERER_MAP[hostname]) return REFERER_MAP[hostname]
  for (const [key, value] of Object.entries(REFERER_MAP)) {
    if (hostname === key || hostname.endsWith(`.${key}`)) return value
  }
  return `https://${hostname}/`
}

function isBlockedHost(hostname: string) {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1' || h.endsWith('.local')) return true
  if (/^10\./.test(h)) return true
  if (/^192\.168\./.test(h)) return true
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true
  if (/^169\.254\./.test(h)) return true
  return false
}

function isAllowedContentType(contentType: string | null) {
  if (!contentType) return true
  return contentType.toLowerCase().startsWith('image/')
}

function isDirectCdnHost(hostname: string) {
  const h = hostname.toLowerCase()
  return h.includes('supabase') || h.includes('r2.dev') || h.includes('cloudflarestorage.com')
}

function cacheHeaders(hostname: string) {
  return {
    'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    'X-Image-Proxy-Host': hostname,
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return new NextResponse('Missing url', { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return new NextResponse('Invalid protocol', { status: 400 })
    if (isBlockedHost(parsed.hostname)) return new NextResponse('Domain not allowed', { status: 403 })
  } catch {
    return new NextResponse('Invalid url', { status: 400 })
  }

  // R2/Supabase/public CDN images should never burn Worker CPU. If an old URL
  // still points here, redirect it back to the direct asset URL.
  if (isDirectCdnHost(parsed.hostname)) {
    return NextResponse.redirect(parsed.toString(), {
      status: 302,
      headers: cacheHeaders(parsed.hostname),
    })
  }

  try {
    const referer = getReferer(parsed.hostname)
    const signal = AbortSignal.timeout(8000)
    const res = await fetch(parsed.toString(), {
      redirect: 'follow',
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LiDexImageProxy/1.0)',
        Referer: referer,
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    })

    if (!res.ok) {
      return new NextResponse(`Upstream image error: ${res.status}`, {
        status: 502,
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=300',
          'Access-Control-Allow-Origin': '*',
          'X-Image-Proxy-Host': parsed.hostname,
          'X-Image-Proxy-Upstream-Status': String(res.status),
        },
      })
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg'
    if (!isAllowedContentType(contentType)) return new NextResponse('Upstream did not return an image', { status: 415 })

    return new NextResponse(res.body, {
      status: 200,
      headers: {
        ...cacheHeaders(parsed.hostname),
        'Content-Type': contentType,
      },
    })
  } catch {
    return new NextResponse('Proxy error', {
      status: 502,
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'Access-Control-Allow-Origin': '*',
        'X-Image-Proxy-Host': parsed.hostname,
        'X-Image-Proxy-Error': 'proxy_failed',
      },
    })
  }
}
