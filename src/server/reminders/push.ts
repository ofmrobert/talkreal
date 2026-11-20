/**
 * Notifications to phones and browsers (Web Push).
 *
 * The signing keys are generated once and kept in the database, so nothing has to be
 * configured by hand and existing subscriptions keep working after a redeploy.
 */
import { eq } from 'drizzle-orm'
import * as webpush from 'web-push'
import { db } from '../db/client'
import { appSettings, pushSubscriptions } from '../db/schema'
import { env } from '../env'

const PUBLIC_KEY = 'vapid_public'
const PRIVATE_KEY = 'vapid_private'

let keys: Promise<{ publicKey: string; privateKey: string }> | null = null

async function loadKeys() {
  const rows = await db.select().from(appSettings)
  const stored = new Map(rows.map((row) => [row.key, row.value]))
  let publicKey = stored.get(PUBLIC_KEY)
  let privateKey = stored.get(PRIVATE_KEY)
  if (!publicKey || !privateKey) {
    const fresh = webpush.generateVAPIDKeys()
    await db
      .insert(appSettings)
      .values([
        { key: PUBLIC_KEY, value: fresh.publicKey },
        { key: PRIVATE_KEY, value: fresh.privateKey },
      ])
      .onConflictDoNothing()
    // Another copy of the server may have saved its keys first: read back what is really stored.
    const again = new Map((await db.select().from(appSettings)).map((row) => [row.key, row.value]))
    publicKey = again.get(PUBLIC_KEY) ?? fresh.publicKey
    privateKey = again.get(PRIVATE_KEY) ?? fresh.privateKey
  }
  return { publicKey, privateKey }
}

function vapidKeys() {
  keys ??= loadKeys().catch((err) => {
    keys = null
    throw err
  })
  return keys
}

/** The key the app needs to subscribe a phone. Safe to show to anyone. */
export async function pushPublicKey(): Promise<string> {
  return (await vapidKeys()).publicKey
}

export interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** Accepts only real notification addresses (https), so the server cannot be pointed at arbitrary hosts. */
export function readSubscription(value: unknown): PushSubscriptionInput | null {
  const sub = value as Partial<PushSubscriptionInput> | null
  if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 1000) return null
  if (typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string') return null
  if (sub.keys.p256dh.length > 300 || sub.keys.auth.length > 300) return null
  try {
    if (new URL(sub.endpoint).protocol !== 'https:') return null
  } catch {
    return null
  }
  return { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }
}

export async function saveSubscription(userId: string, sub: PushSubscriptionInput): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    })
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
}

export async function countSubscriptions(userId: string): Promise<number> {
  return (await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))).length
}

/** Sends one notification to every device of the student. Returns how many devices received it. */
export async function sendPush(userId: string, message: { title: string; body: string; url?: string; tag?: string }): Promise<number> {
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
  if (subs.length === 0) return 0
  const { publicKey, privateKey } = await vapidKeys()
  const payload = JSON.stringify({ ...message, url: message.url ?? '/' })

  let delivered = 0
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
          vapidDetails: { subject: env.appUrl, publicKey, privateKey },
          TTL: 6 * 60 * 60,
          timeout: 10_000,
        })
        delivered += 1
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // 404/410: the phone removed the app or switched notifications off. Forget that device.
        if (status === 404 || status === 410) await removeSubscription(sub.endpoint)
        else console.error('Push not delivered:', status ?? (err instanceof Error ? err.message : err))
      }
    }),
  )
  return delivered
}
