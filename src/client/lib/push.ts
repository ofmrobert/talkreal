import { api } from './api'

/** Phone and browser notifications: whether this device can show them, and switching them on. */

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** The notification key arrives as text; the browser wants it as bytes. */
function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** The app's background worker, or null if it is not running (e.g. not installed yet). */
async function worker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000))])
}

/**
 * Is this very device already subscribed? If so, the server is told again, in case it forgot.
 */
export async function pushIsOnHere(): Promise<boolean> {
  const registration = await worker()
  const subscription = await registration?.pushManager.getSubscription().catch(() => null)
  if (!subscription) return false
  api('/reminders/push', { subscription: subscription.toJSON() }).catch(() => {})
  return true
}

/**
 * Asks the student for permission and subscribes this device. Must be called from a tap.
 * 'denied' = the student (or the phone's settings) said no; 'unsupported' = it cannot work here.
 */
export async function turnPushOn(publicKey: string): Promise<'on' | 'denied' | 'unsupported'> {
  if (!pushSupported()) return 'unsupported'
  try {
    if ((await Notification.requestPermission()) !== 'granted') return 'denied'
    const registration = await worker()
    if (!registration) return 'unsupported'
    const subscription = (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }))
    await api('/reminders/push', { subscription: subscription.toJSON() })
    return 'on'
  } catch {
    return 'unsupported'
  }
}
