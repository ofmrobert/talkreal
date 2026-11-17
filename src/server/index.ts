import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'

const CLIENT_DIR = './dist/client'

// These must never be cached by the browser, or installed apps stop receiving updates.
const NEVER_CACHE = /(?:index\.html|sw\.js|registerSW\.js|manifest\.webmanifest)$/

const app = new Hono()

app.get('/api/health', (c) => c.json({ ok: true, time: new Date().toISOString() }))
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

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => {
  console.log(`Talkreal server listening on port ${port}`)
})
