import { mkdirSync } from 'node:fs'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { env } from '../env'
import * as schema from './schema'

export type Db = NodePgDatabase<typeof schema>

const MIGRATIONS = './drizzle'

/** Which database is in use, and why the real one was not used (if it wasn't). Shown by the self-check. */
export const dbStatus: { kind: 'postgresql' | 'embedded'; error?: string } = { kind: 'embedded' }

/**
 * Some hosting panels store the address with the password's special characters decoded
 * (`#`, `&`, `;` instead of `%23`, `%26`, `%3B`), which is no longer a valid address.
 * This re-encodes the name and password. The password may itself contain `@` or `:`,
 * so the split is at the last `@` and the first `:`.
 */
export function safeConnectionString(raw: string): string {
  const match = raw.match(/^(postgres(?:ql)?:\/\/)(.*)@([^@]*)$/s)
  if (!match) return raw
  const [, scheme, credentials, rest] = match
  const colon = credentials.indexOf(':')
  const user = colon === -1 ? credentials : credentials.slice(0, colon)
  const password = colon === -1 ? '' : credentials.slice(colon + 1)
  const encode = (value: string) => {
    let plain = value
    try {
      plain = decodeURIComponent(value)
    } catch {
      // A stray % that is not an escape: the value is already plain text.
    }
    return encodeURIComponent(plain)
  }
  return `${scheme}${encode(user)}${colon === -1 ? '' : `:${encode(password)}`}@${rest}`
}

async function connectPostgres(): Promise<Db> {
  const { default: pg } = await import('pg')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const { migrate } = await import('drizzle-orm/node-postgres/migrator')
  const pool = new pg.Pool({
    connectionString: safeConnectionString(env.databaseUrl),
    connectionTimeoutMillis: 10_000,
    // Some hosts use their own certificate authority. DATABASE_SSL=no-verify encrypts without checking it.
    ssl: env.databaseSsl === 'no-verify' ? { rejectUnauthorized: false } : undefined,
  })
  const db = drizzle(pool, { schema })
  await migrate(db, { migrationsFolder: MIGRATIONS })
  return db
}

async function connectEmbedded(): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const { migrate } = await import('drizzle-orm/pglite/migrator')
  mkdirSync('./.data', { recursive: true })
  const db = drizzle(new PGlite('./.data/pg'), { schema })
  await migrate(db, { migrationsFolder: MIGRATIONS })
  // Both drivers expose the same query API; the app only uses that shared part.
  return db as unknown as Db
}

/**
 * Connects to the database and brings its tables up to date.
 * - DATABASE_URL set: a real PostgreSQL server (production). Data is permanent.
 * - otherwise: an embedded PostgreSQL in ./.data (local development). Data is lost on every redeploy.
 *
 * If the real database cannot be reached, the app still starts on the embedded one instead of
 * going down, and the reason is reported by the self-check.
 */
async function connect(): Promise<Db> {
  if (env.databaseUrl) {
    try {
      const db = await connectPostgres()
      dbStatus.kind = 'postgresql'
      console.log('Database: PostgreSQL')
      return db
    } catch (err) {
      // The query wrapper hides the real reason in `cause`; keep both.
      const cause = err instanceof Error && err.cause instanceof Error ? ` / ${err.cause.message}` : ''
      dbStatus.error = (err instanceof Error ? err.message : String(err)) + cause
      console.error('Could not use DATABASE_URL, falling back to the embedded database:', dbStatus.error)
    }
  }
  const db = await connectEmbedded()
  if (env.isProduction) {
    console.warn('Using the embedded database. Data is lost on every redeploy.')
  } else {
    console.log('Database: embedded (./.data/pg)')
  }
  return db
}

export const db = await connect()
