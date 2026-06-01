export function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null

  try {
    if (url.startsWith('/')) return url

    const parsed = new URL(url)
    const host = parsed.hostname
    const isSupabase = host.includes('supabase')
    const isLocal = host === 'localhost' || host === '127.0.0.1'

    if (isSupabase || isLocal) return url
    return `/api/image-proxy?url=${encodeURIComponent(url)}`
  } catch {
    return url
  }
}
