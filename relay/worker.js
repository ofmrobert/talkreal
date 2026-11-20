/**
 * Talkreal AI relay (runs on Cloudflare, outside Russia).
 *
 * Google's AI refuses connections from Russian servers. Our server in Russia connects here
 * instead, and this relay passes everything on to Google unchanged, in both directions,
 * including live voice (WebSocket) connections.
 *
 * Addresses that start with /anthropic go to Anthropic (Claude) instead, which also does not
 * serve Russia directly. On the app's server set ANTHROPIC_BASE_URL to this relay's address
 * followed by /anthropic.
 *
 * It holds no keys and stores nothing. Only our own server's address may use it.
 */
const UPSTREAM = 'generativelanguage.googleapis.com'
const ANTHROPIC = 'api.anthropic.com'

// Headers that reveal where the request really came from. They are not passed on.
const STRIP = ['cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip', 'cdn-loop']

export default {
  async fetch(request, env) {
    const caller = request.headers.get('cf-connecting-ip')
    const allowed = (env.ALLOWED_IPS ?? '').split(',').map((ip) => ip.trim())
    if (!allowed.includes(caller)) return new Response('forbidden', { status: 403 })

    const url = new URL(request.url)
    if (url.pathname === '/relay-health') {
      return Response.json({ ok: true, colo: request.cf?.colo ?? null, country: request.cf?.country ?? null })
    }

    url.protocol = 'https:'
    if (url.pathname === '/anthropic' || url.pathname.startsWith('/anthropic/')) {
      url.hostname = ANTHROPIC
      url.pathname = url.pathname.slice('/anthropic'.length) || '/'
    } else {
      url.hostname = UPSTREAM
    }
    url.port = ''
    const headers = new Headers(request.headers)
    for (const name of STRIP) headers.delete(name)

    // Passing the request to fetch() also carries WebSocket upgrades through.
    const upstream = await fetch(new Request(url, { method: request.method, headers, body: request.body }))
    // A live voice connection is handed back untouched.
    if (upstream.status === 101 || upstream.webSocket) return upstream

    // A few notes for troubleshooting: where this relay ran, and what the other side answered.
    const answer = new Response(upstream.body, upstream)
    answer.headers.set('x-relay-colo', request.cf?.colo ?? '')
    answer.headers.set('x-relay-to', url.hostname)
    answer.headers.set('x-upstream-ray', upstream.headers.get('cf-ray') ?? '')
    return answer
  },
}
