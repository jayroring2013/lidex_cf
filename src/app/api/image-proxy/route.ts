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
  return (
    h.includes('supabase') ||
    h.includes('r2.dev') ||
    h.includes('cloudflarestorage.com') ||
    h.includes('tana.moe')
  )
}

function proxiedFallbackUrl(url: string) {
  const parsed = new URL(url)
  const target = `${parsed.hostname}${parsed.pathname}${parsed.search}`
  return `https://images.weserv.nl/?url=${encodeURIComponent(target)}`
}

function cacheHeaders(hostname: string) {
  return {
    'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    'X-Image-Proxy-Host': hostname,
  }
}

async function fetchImage(url: string, referer: string, origin: string, signal: AbortSignal): Promise<Response | null> {
  const headerProfiles: HeadersInit[] = [
    {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: referer,
      Origin: origin,
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site',
    },
    {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: referer,
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
    },
    {
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
  ]

  let lastResponse: Response | null = null

  for (const headers of headerProfiles) {
    let res: Response
    try {
      res = await fetch(url, {
        redirect: 'follow',
        headers,
        signal,
      })
    } catch {
      continue
    }

    if (res.ok) return res
    lastResponse = res

    if (![401, 403, 429].includes(res.status)) break
  }

  return lastResponse
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return new NextResponse('Missing url', { status: 400 })

  // Read from Cloudflare Edge Cache programmatically
  const cache = typeof caches !== 'undefined' ? (caches as any).default : null
  const cacheKey = req.url
  if (cache) {
    try {
      const cachedResponse = await cache.match(cacheKey)
      if (cachedResponse) {
        const headers = new Headers(cachedResponse.headers)
        headers.set('X-Image-Proxy-Cache', 'HIT')
        return new NextResponse(cachedResponse.body, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers,
        })
      }
    } catch (e) {
      console.error('Cache read error:', e)
    }
  }

  let parsed: URL
  try {
    parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return new NextResponse('Invalid protocol', { status: 400 })
    if (isBlockedHost(parsed.hostname)) return new NextResponse('Domain not allowed', { status: 403 })
  } catch {
    return new NextResponse('Invalid url', { status: 400 })
  }

  // R2/Supabase/public CDN images should never burn Worker CPU.
  if (isDirectCdnHost(parsed.hostname)) {
    return NextResponse.redirect(parsed.toString(), {
      status: 302,
      headers: cacheHeaders(parsed.hostname),
    })
  }

  try {
    const referer = getReferer(parsed.hostname)
    const signal = AbortSignal.timeout(15000)

    let res = await fetchImage(parsed.toString(), referer, new URL(referer).origin, signal)

    if (!res?.ok) {
      const fallback = proxiedFallbackUrl(parsed.toString())
      res = await fetch(fallback, {
        redirect: 'follow',
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
        signal,
      })

      if (!res.ok) {
        return new NextResponse(`Upstream image error: ${res.status}`, {
          status: 502,
          headers: {
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*',
            'X-Image-Proxy-Host': parsed.hostname,
            'X-Image-Proxy-Upstream-Status': String(res.status),
          },
        })
      }
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg'
    if (!isAllowedContentType(contentType)) return new NextResponse('Upstream did not return an image', { status: 415 })

    const buffer = await res.arrayBuffer()

    const headers = {
      ...cacheHeaders(parsed.hostname),
      'Content-Type': contentType,
      'X-Image-Proxy-Cache': 'MISS',
    }

    const response = new NextResponse(buffer, {
      status: 200,
      headers,
    })

    if (cache) {
      try {
        const responseToCache = response.clone()
        await cache.put(cacheKey, responseToCache)
      } catch (e) {
        console.error('Cache write error:', e)
      }
    }

    return response
  } catch {
    return new NextResponse('Proxy error', {
      status: 502,
      headers: {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'X-Image-Proxy-Host': parsed.hostname,
        'X-Image-Proxy-Error': 'proxy_failed',
      },
    })
  }
}
