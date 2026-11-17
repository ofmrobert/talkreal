import { mkdirSync } from 'node:fs'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { env } from '../env'
import * as schema from './schema'

export type Db = NodePgDatabase<typeof schema>

const MIGRATIONS = './drizzle'

/**
 * Connects to the database and brings its tables up to date.
 * - DATABASE_URL set: a real PostgreSQL server (production).
 * - otherwise: an embedded PostgreSQL stored in ./.data (local development and first tests).
 */
async function connect(): Promise<Db> {
  if (env.databaseUrl) {
    const { drizzle } = await import('drizzle-orm/node-postgres')
    const { migrate } = await import('drizzle-orm/node-postgres/migrator')
    const db = drizzle(env.databaseUrl, { schema })
    await migrate(db, { migrationsFolder: MIGRATIONS })
    console.log('Database: PostgreSQL')
    return db
  }

  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const { migrate } = await import('drizzle-orm/pglite/migrator')
  mkdirSync('./.data', { recursive: true })
  const db = drizzle(new PGlite('./.data/pg'), { schema })
  await migrate(db, { migrationsFolder: MIGRATIONS })
  if (env.isProduction) {
    console.warn('DATABASE_URL is not set: using the embedded database. Data is lost on every redeploy.')
  } else {
    console.log('Database: embedded (./.data/pg)')
  }
  // Both drivers expose the same query API; the app only uses that shared part.
  return db as unknown as Db
}

export const db = await connect()
