import { unstable_cache } from 'next/cache'
import { neon } from '@neondatabase/serverless'
import { getCloudflareContext } from '@opennextjs/cloudflare'

let sqlClient: ReturnType<typeof neon> | null = null

type SqlQuery = (query: string, params?: any[]) => Promise<any[]>

const SELECT_CACHE_SECONDS = Number(process.env.NEON_SELECT_CACHE_SECONDS || 3600)

function getDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }

  try {
    const ctx = getCloudflareContext()
    const env = ctx?.env as any
    if (env?.DATABASE_URL) {
      return env.DATABASE_URL
    }
  } catch (error) {
    // Ignore error if not in Cloudflare context or not initialized
  }

  return undefined
}

function getSqlClient() {
  const databaseUrl = getDatabaseUrl()

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is missing!')
  }

  if (!sqlClient) {
    sqlClient = neon(databaseUrl)
  }

  return sqlClient
}

function isReadQuery(query: string) {
  const normalized = query.trim().replace(/^--.*$/gm, '').trim().toLowerCase()
  return normalized.startsWith('select') || normalized.startsWith('with')
}

function isUnsafeToCache(query: string) {
  const normalized = query.toLowerCase()

  // Never cache private/user-specific data or writes hidden inside CTEs.
  if (/\b(insert|update|delete|upsert|alter|drop|create|truncate)\b/.test(normalized)) return true
  if (/\b(series_user_|user_profiles|novel_votes|auth\.)\b/.test(normalized)) return true

  // Avoid caching time/random-sensitive SQL unless the caller wraps it explicitly.
  if (/\b(now\(\)|current_timestamp|current_date|random\(\))\b/.test(normalized)) return true

  return false
}

function makeCachedSelect(query: string, params: any[]) {
  const keyParams = JSON.stringify(params)
  return unstable_cache(
    async () => getSqlClient()(query, params) as Promise<any[]>,
    ['neon-select-v1', query, keyParams],
    {
      revalidate: SELECT_CACHE_SECONDS,
      tags: ['neon-public-select'],
    }
  )
}

// Neon HTTP client for edge and serverless environments.
// Public read-only SELECT queries are cached for one hour by default to reduce
// Neon compute/query usage and Cloudflare Worker CPU on repeated traffic.
// User/private tables and all writes bypass this cache automatically.
export const sql: SqlQuery = (query, params = []) => {
  if (isReadQuery(query) && !isUnsafeToCache(query)) {
    return makeCachedSelect(query, params)()
  }

  return getSqlClient()(query, params) as Promise<any[]>
}
