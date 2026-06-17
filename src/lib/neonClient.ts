import { neon } from '@neondatabase/serverless'

let sqlClient: ReturnType<typeof neon> | null = null

type SqlQuery = (query: string, params?: any[]) => Promise<any[]>

function getSqlClient() {
  const databaseUrl = process.env.DATABASE_URL

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
