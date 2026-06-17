import { neon } from '@neondatabase/serverless'
import { getCloudflareContext } from '@opennextjs/cloudflare'

let sqlClient: ReturnType<typeof neon> | null = null

type SqlQuery = (query: string, params?: any[]) => Promise<any[]>

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

// Neon HTTP client for edge and serverless environments
export const sql: SqlQuery = (query, params) => {
  return getSqlClient()(query, params) as Promise<any[]>
}

