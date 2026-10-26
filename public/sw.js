// LiDex Service Worker - Cache-First Image Engine
// Reduces Cloudflare Free Tier Worker requests and bandwidth to near zero for returning users.

const CACHE_NAME = 'lidex-images-v1'
const MAX_ENTRIES = 800

self.addEventListener('install', (event) => {
  // Activate immediately without waiting for existing tabs to close
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key)
          }
        })
      )
      // Take control of all open pages immediately
      await self.clients.claim()
    })()
  )
})

// Helper: Trim cache to MAX_ENTRIES using LRU FIFO
async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName)
    const keys = await cache.keys()
    if (keys.length > maxItems) {
      // Remove oldest entries
      const deleteCount = keys.length - maxItems
      for (let i = 0; i < deleteCount; i++) {
        await cache.delete(keys[i])
      }
    }
  } catch (err) {
    // Non-fatal
  }
}

// Determine if request is an image or cover resource
function isImageRequest(request) {
  const url = request.url

  // 1. Explicit image proxy endpoint
  if (url.includes('/api/image-proxy')) return true

  // 2. Request destination is image
  if (request.destination === 'image') return true

  // 3. Static templates or cover files
  if (url.includes('/templates/')) return true

  // 4. File extension check
  const pathname = new URL(url).pathname.toLowerCase()
  if (
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.avif') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico')
  ) {
    return true
  }

  // 5. External CDN covers
  if (
    url.includes('images.weserv.nl') ||
    url.includes('r2.dev') ||
    url.includes('imagedelivery.net')
  ) {
    return true
  }

  return false
}

self.addEventListener('fetch', (event) => {
  const request = event.request

  // Only intercept GET requests
  if (request.method !== 'GET') return

  if (isImageRequest(request)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME)

        // 1. Try local cache first (0ms, 0 Cloudflare Worker invocations)
        const cachedResponse = await cache.match(request)
        if (cachedResponse) {
          // Check cache age: 7 days TTL (7 * 24 * 60 * 60 * 1000 = 604,800,000 ms)
          const dateHeader = cachedResponse.headers.get('date')
          const isFresh = !dateHeader || (Date.now() - new Date(dateHeader).getTime() < 7 * 24 * 60 * 60 * 1000)
          if (isFresh) {
            return cachedResponse
          }

          // If older than 7 days, attempt network revalidation, fallback to cached
          try {
            const networkResponse = await fetch(request)
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone())
              trimCache(CACHE_NAME, MAX_ENTRIES)
              return networkResponse
            }
          } catch {
            return cachedResponse
          }
        }

        // 2. Not in cache: fetch from network
        try {
          const networkResponse = await fetch(request)

          // Only cache successful 200 responses
          if (networkResponse && networkResponse.status === 200) {
            // Clone because response stream can only be read once
            cache.put(request, networkResponse.clone())
            trimCache(CACHE_NAME, MAX_ENTRIES)
          }

          return networkResponse
        } catch (fetchErr) {
          // If offline and cache miss, return whatever was cached or fallback
          if (cachedResponse) return cachedResponse
          throw fetchErr
        }
      })()
    )
  }
})
