import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import './db/client'
import { startTelegramBot } from './auth/telegram'
import { env } from './env'
import { authRoutes } from './routes/auth'
import { courseRoutes } from './routes/course'
import { meRoutes } from './routes/me'
import { placementRoutes } from './routes/placement'

const CLIENT_DIR = './dist/client'

// These must never be cached by the browser, or installed apps stop receiving updates.
const NEVER_CACHE = /(?:index\.html|sw\.js|registerSW\.js|manifest\.webmanifest)$/

const app = new Hono()

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'server_error' }, 500)
})

app.get('/api/health', (c) => c.json({ ok: true, time: new Date().toISOString() }))
app.route('/api/auth', authRoutes)
app.route('/api/me', meRoutes)
app.route('/api/placement', placementRoutes)
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

serve({ fetch: app.fetch, port: env.port, hostname: '0.0.0.0' }, () => {
  console.log(`Talkreal server listening on port ${env.port}`)
})
