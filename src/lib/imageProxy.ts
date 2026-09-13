export function sanitizeCoverUrl(url: string | null | undefined): string | null {
  if (!url) return null
  let sanitized = url.trim()
  if (!sanitized) return null
  // Replace defunct domain hako.re -> hako.vn
  sanitized = sanitized.replace(/\.hako\.re\b/gi, '.hako.vn')
  return sanitized
}

export function proxyImageUrl(url: string | null | undefined): string | null {
  const cleanUrl = sanitizeCoverUrl(url)
  if (!cleanUrl) return null

  try {
    if (cleanUrl.startsWith('/')) return cleanUrl

    const enableProxy = process.env.NEXT_PUBLIC_ENABLE_IMAGE_PROXY === 'true'
    if (!enableProxy) return cleanUrl

    const parsed = new URL(cleanUrl)
    const host = parsed.hostname
    const isSupabase = host.includes('supabase')
    const isLocal = host === 'localhost' || host === '127.0.0.1'
    const isR2 = host.includes('r2.dev') || host.includes('cloudflarestorage.com')
    const isTana = host.includes('tana.moe')

    if (isSupabase || isLocal || isR2 || isTana) return cleanUrl
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
    if (
      !h.includes('supabase') &&
      !h.includes('localhost') &&
      !h.includes('r2.dev') &&
      !h.includes('cloudflarestorage.com') &&
      !h.includes('tana.moe')
    ) {
      return `/api/image-proxy?url=${encodeURIComponent(cleanUrl)}`
    }
  } catch {}
  return cleanUrl
}
