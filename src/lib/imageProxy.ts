export function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null

  try {
    if (url.startsWith('/')) return url

    // Image proxying is expensive on the Cloudflare free tier because every
    // proxied image consumes Worker CPU and subrequests. Prefer direct image
    // URLs. Turn the proxy back on only for known hotlink-blocked sources by
    // setting NEXT_PUBLIC_ENABLE_IMAGE_PROXY=true.
    const enableProxy = process.env.NEXT_PUBLIC_ENABLE_IMAGE_PROXY === 'true'
    if (!enableProxy) return url

    const parsed = new URL(url)
    const host = parsed.hostname
    const isSupabase = host.includes('supabase')
    const isLocal = host === 'localhost' || host === '127.0.0.1'
    const isR2 = host.includes('r2.dev') || host.includes('cloudflarestorage.com')

    if (isSupabase || isLocal || isR2) return url
    return `/api/image-proxy?url=${encodeURIComponent(url)}`
  } catch {
    return url
  }
}

export function proxyImg(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    if (url.startsWith('/')) return url
    const h = new URL(url).hostname
    if (
      !h.includes('supabase') &&
      !h.includes('localhost') &&
      !h.includes('r2.dev') &&
      !h.includes('cloudflarestorage.com')
    ) {
      return `/api/image-proxy?url=${encodeURIComponent(url)}`
    }
  } catch {}
  return url
}
