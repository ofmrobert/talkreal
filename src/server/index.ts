import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { dbStatus, safeConnectionString } from './db/client'
import { startTelegramBot } from './auth/telegram'
import { env } from './env'
import { authRoutes } from './routes/auth'
import { courseRoutes } from './routes/course'
import { diagRoutes } from './routes/diag'
import { meRoutes } from './routes/me'
import { placementRoutes } from './routes/placement'
import { reminderRoutes } from './routes/reminders'
import { reviewRoutes } from './routes/review'
import { testRoutes } from './routes/tests'
import { startReminders } from './reminders/scheduler'
import { voiceRoutes } from './routes/voice'
import { attachVoiceSocket } from './voice/socket'

const CLIENT_DIR = './dist/client'

// These must never be cached by the browser, or installed apps stop receiving updates.
const NEVER_CACHE = /(?:index\.html|sw\.js|push-sw\.js|registerSW\.js|manifest\.webmanifest)$/

const app = new Hono()

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'server_error' }, 500)
})

/** Why the real database was not used, as a category only (the full message may contain the server address). */
function databaseProblem(): string | null {
  const message = dbStatus.error?.toLowerCase()
  if (!message) return env.databaseUrl ? null : 'not_set'
  if (/certificate|ssl|tls/.test(message)) return 'ssl'
  if (/password|authentication|role/.test(message)) return 'login'
  if (/does not exist|permission denied/.test(message)) return 'database_or_rights'
  if (/timeout|enotfound|econnrefused|ehostunreach|enetunreach|eai_again/.test(message)) return 'unreachable'
  if (/invalid|url|parse/.test(message)) return 'bad_address'
  return 'other'
}

/** The database error with every address, name and secret from the connection line removed. */
function databaseErrorSafe(): string | null {
  if (!dbStatus.error) return null
  let text = dbStatus.error
  const secrets = new Set<string>()
  try {
    const url = new URL(safeConnectionString(env.databaseUrl))
    for (const part of [url.hostname, url.username, url.password, decodeURIComponent(url.password), url.pathname.slice(1)]) {
      if (part.length > 2) secrets.add(part)
    }
  } catch {
    // The connection line itself is malformed: nothing reliable to pick out of it.
  }
  if (env.databaseUrl) secrets.add(env.databaseUrl)
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) text = text.split(secret).join('***')
  return text
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '*.*.*.*')
    .replace(/[a-z]+:\/\/\S+/gi, '***')
    .slice(0, 200)
}

app.get('/api/health', (c) =>
  c.json({ ok: true, time: new Date().toISOString(), database: dbStatus.kind, databaseProblem: databaseProblem(), databaseError: databaseErrorSafe(), databaseUrlShape: dbStatus.kind === 'postgresql' ? undefined : env.databaseUrlShape }),
)
app.route('/api/auth', authRoutes)
app.route('/api/me', meRoutes)
app.route('/api/placement', placementRoutes)
app.route('/api/diag', diagRoutes)
app.route('/api/voice', voiceRoutes)
app.route('/api/reminders', reminderRoutes)
app.route('/api', reviewRoutes)
app.route('/api', testRoutes)
app.route('/api', courseRoutes)
app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404))

app.use(
  '*',
  serveStatic({
    root: CLIENT_DIR,
    onFound: (path, c) => {
      c.header(
        'Cache-Control',
        NEVER_CACHE.test(path) ? 'no-cache' : 'public, max-age=31536000, immutable',
      )
    },
  }),
)

// Any other address opens the app itself (screens are routed inside the app).
app.get(
  '*',
  serveStatic({
    path: `${CLIENT_DIR}/index.html`,
    onFound: (_path, c) => c.header('Cache-Control', 'no-cache'),
  }),
)

void startTelegramBot()
startReminders()

const server = serve({ fetch: app.fetch, port: env.port, hostname: '0.0.0.0' }, () => {
  console.log(`Talkreal server listening on port ${env.port}`)
})

attachVoiceSocket(server as import('node:http').Server)
