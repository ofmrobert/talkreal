import { load, save } from './storage'

/**
 * Tells the server which screen was opened, for the statistics in the admin panel.
 * The visitor is a random number kept in this browser; no name, no IP address.
 */

interface Source {
  referrer?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
}

function visitorId(): string {
  let id = load('visitor')
  if (!id) {
    id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    save('visitor', id)
  }
  return id
}

/**
 * Where this visitor first came from: the link's campaign tags (?utm_source=instagram…) and the
 * site that linked here. Remembered from the very first visit, so a purchase weeks later is
 * still credited to the right place.
 */
function firstSource(): Source {
  try {
    const saved = load('source')
    if (saved) return JSON.parse(saved) as Source
  } catch {
    // Unreadable: work it out again below.
  }
  const params = new URLSearchParams(window.location.search)
  const outside = document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer : undefined
  const source: Source = {
    referrer: outside,
    utmSource: params.get('utm_source') ?? undefined,
    utmMedium: params.get('utm_medium') ?? undefined,
    utmCampaign: params.get('utm_campaign') ?? undefined,
  }
  save('source', JSON.stringify(source))
  return source
}

export function trackPage(path: string): void {
  if (path.startsWith('/admin')) return
  try {
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({ visitorId: visitorId(), path, ...firstSource() }),
    }).catch(() => {})
  } catch {
    // Statistics must never get in the way of the app.
  }
}
