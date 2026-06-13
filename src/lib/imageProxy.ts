export function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null

  try {
    if (url.startsWith('/')) return url

    const parsed = new URL(url)
    const host = parsed.hostname
    const isSupabase = host.includes('supabase')
    const isLocal = host === 'localhost' || host === '127.0.0.1'
    const isR2 = host.includes('r2.dev') || host.includes('cloudflarestorage.com')

    // Serve Supabase storage, R2, and local URLs directly — no proxy needed
    if (isSupabase || isLocal || isR2) return url
    return `/api/image-proxy?url=${encodeURIComponent(url)}`
  } catch {
    return url
  }
}
