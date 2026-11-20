import { Hono } from 'hono'
import { optionalUserId } from '../auth/sessions'
import { db } from '../db/client'
import { pageViews } from '../db/schema'

/**
 * Counts screens opened, for the statistics in the admin panel. Works for visitors and
 * students alike. No IP address is kept: only a random visitor id the browser made up.
 */
export const trackRoutes = new Hono()

/** A browser gone wrong (or someone playing) cannot flood the table: this many views a minute per visitor. */
const PER_MINUTE = 60
const recent = new Map<string, { minute: number; count: number }>()

const short = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null)

/** Only the other site's name is kept, not the full address someone came from. */
function host(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  try {
    return new URL(value).hostname.replace(/^www\./, '').slice(0, 100) || null
  } catch {
    return null
  }
}

trackRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const visitorId = short(body.visitorId, 64)
  const path = short(body.path, 200)
  // The admin panel's own screens are not visits.
  if (!visitorId || !path || !path.startsWith('/') || path.startsWith('/admin')) return c.json({ ok: true })

  const minute = Math.floor(Date.now() / 60_000)
  const seen = recent.get(visitorId)
  const count = seen?.minute === minute ? seen.count + 1 : 1
  recent.set(visitorId, { minute, count })
  if (recent.size > 5000) recent.clear()
  if (count > PER_MINUTE) return c.json({ ok: true })

  try {
    await db.insert(pageViews).values({
      visitorId,
      userId: await optionalUserId(c),
      path,
      referrer: host(body.referrer),
      utmSource: short(body.utmSource, 80),
      utmMedium: short(body.utmMedium, 80),
      utmCampaign: short(body.utmCampaign, 80),
      device: /Mobi|Android|iPhone|iPad/i.test(c.req.header('user-agent') ?? '') ? 'mobile' : 'desktop',
    })
  } catch (err) {
    // Statistics must never get in the way of the app.
    console.error('Could not record a page view:', err instanceof Error ? err.message : err)
  }
  return c.json({ ok: true })
})
