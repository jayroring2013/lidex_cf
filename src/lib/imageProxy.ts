export function sanitizeCoverUrl(url: string | null | undefined): string | null {
  if (!url) return null
  let sanitized = url.trim()
  if (!sanitized) return null
  // Replace defunct domain hako.re -> hako.vn
  sanitized = sanitized.replace(/\.hako\.re\b/gi, '.hako.vn')
  return sanitized
}

function isDirectCdn(host: string): boolean {
  const h = host.toLowerCase()
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h.includes('supabase') ||
    h.includes('r2.dev') ||
    h.includes('cloudflarestorage.com') ||
    h.includes('imagedelivery.net') ||
    h.includes('pages.dev') ||
    h.includes('workers.dev') ||
    h.includes('wibubros.id.vn') ||
    h.includes('tana.moe')
  )
}

export function proxyImageUrl(url: string | null | undefined): string | null {
  const cleanUrl = sanitizeCoverUrl(url)
  if (!cleanUrl) return null

  try {
    if (cleanUrl.startsWith('/')) return cleanUrl

    const enableProxy = process.env.NEXT_PUBLIC_ENABLE_IMAGE_PROXY === 'true'
    if (!enableProxy) return cleanUrl

    const parsed = new URL(cleanUrl)
    if (isDirectCdn(parsed.hostname)) return cleanUrl
    return `/api/image-proxy?url=${encodeURIComponent(cleanUrl)}`
  } catch {
    return cleanUrl
  }
}

export function proxyImg(url: string | null | undefined): string | null {
  const cleanUrl = sanitizeCoverUrl(url)
  if (!cleanUrl) return null
  try {
    if (cleanUrl.startsWith('/')) return cleanUrl
    const h = new URL(cleanUrl).hostname
    if (!isDirectCdn(h)) {
      return `/api/image-proxy?url=${encodeURIComponent(cleanUrl)}`
    }
  } catch {}
  return cleanUrl
}
