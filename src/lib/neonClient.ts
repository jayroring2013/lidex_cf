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

function normalizeQueryForSchema(query: string) {
  if (
    query.includes('SELECT v.series_id, v.release_date, v.is_special, s.publisher') &&
    query.includes('FROM volumes v') &&
    query.includes('LEFT JOIN series s ON v.series_id = s.id')
  ) {
    return query
      .replace('SELECT v.series_id, v.release_date, v.is_special, s.publisher', 'SELECT v.series_id, v.release_date, v.is_special, NULL::text AS publisher')
      .replace('LEFT JOIN series s ON v.series_id = s.id', '')
  }

  return query
}

function isOptionalSummaryQuery(query: string) {
  const normalized = query.trim().toLowerCase()
  return normalized.startsWith('select * from get_series_rating_summary(')
    || normalized.startsWith('select * from get_series_library_summary(')
}

// Module-level cached function — Next.js automatically includes the serialized
// (query, params) arguments in the cache key, so each unique query+params pair
// gets its own cache slot. Do NOT move this inside a function or closure.
const cachedSelect = unstable_cache(
  async (query: string, params: any[] = []) => {
    return getSqlClient()(query, params) as Promise<any[]>
  },
  ['neon-select-v2'],
  {
    revalidate: SELECT_CACHE_SECONDS,
    tags: ['neon-public-select'],
  }
)

// Neon HTTP client for edge and serverless environments.
// Public read-only SELECT queries are cached for one hour by default to reduce
// Neon compute/query usage and Cloudflare Worker CPU on repeated traffic.
// User/private tables and all writes bypass this cache automatically.
export const sql: SqlQuery = async (query, params = []) => {
  const normalizedQuery = normalizeQueryForSchema(query)

  try {
    if (isReadQuery(normalizedQuery) && !isUnsafeToCache(normalizedQuery)) {
      return await cachedSelect(normalizedQuery, params)
    }

    return await getSqlClient()(normalizedQuery, params) as any[]
  } catch (error) {
    if (isOptionalSummaryQuery(query) && String(error).includes('does not exist')) {
      return []
    }

    throw error
  }
}
