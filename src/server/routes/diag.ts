import { Hono } from 'hono'
import { env } from '../env'

/**
 * Network check, available only in test mode (DEV_SHOW_CODES=1).
 * Shows which outside services this server can reach, how fast, and what they answer.
 * Used to decide how AI requests should leave Russia.
 */
const TARGETS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models?key=invalid-key-for-reachability-test',
  openai: 'https://api.openai.com/v1/models',
  cloudflareSmall: 'https://www.cloudflare.com/cdn-cgi/trace',
  cloudflareBig: 'https://speed.cloudflare.com/__down?bytes=300000',
  denoDeploy: 'https://deno.com/deploy',
  vercel: 'https://vercel.com/robots.txt',
  flyio: 'https://fly.io/robots.txt',
  telegram: 'https://api.telegram.org/',
}

async function probe(url: string) {
  const started = Date.now()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    const body = await res.arrayBuffer()
    return {
      ok: true,
      status: res.status,
      ms: Date.now() - started,
      bytes: body.byteLength,
      sample: new TextDecoder().decode(body.slice(0, 220)).replace(/\s+/g, ' '),
    }
  } catch (err) {
    const cause = err instanceof Error && err.cause instanceof Error ? ` / ${err.cause.message}` : ''
    return { ok: false, ms: Date.now() - started, error: (err instanceof Error ? err.message : String(err)) + cause }
  }
}

export const diagRoutes = new Hono()

diagRoutes.get('/net', async (c) => {
  if (!env.showCodes) return c.json({ error: 'not_found' }, 404)
  const custom = c.req.query('url')
  const targets = custom ? { custom } : TARGETS
  const entries = await Promise.all(
    Object.entries(targets).map(async ([name, url]) => [name, await probe(url)] as const),
  )
  return c.json(Object.fromEntries(entries))
})
