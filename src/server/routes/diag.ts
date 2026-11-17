import { Hono } from 'hono'
import { dbStatus } from '../db/client'
import { env } from '../env'
import { emailConfigured } from '../auth/email'
import { geminiProvider } from '../voice/gemini'

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
  resend: 'https://api.resend.com/domains',
  brevo: 'https://api.brevo.com/v3/account',
  unisender: 'https://go1.unisender.ru/ru/transactional/api/v1/system/info.json',
  relay: env.ai.geminiWsBase.replace(/^ws/, 'http') + '/relay-health',
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

/** Tries a real connection to the AI voice service with the configured key and reports what happened. */
diagRoutes.get('/voice', async (c) => {
  if (!env.showCodes) return c.json({ error: 'not_found' }, 404)
  if (!env.ai.geminiKey) return c.json({ ok: false, error: 'GEMINI_API_KEY is not set' })
  const started = Date.now()
  const modelList = await probe(
    // Goes the same way as voice calls: directly, or through the relay if one is configured.
    `${env.ai.geminiWsBase.replace(/^ws/, 'http')}/v1beta/models?pageSize=1&key=${env.ai.geminiKey}`,
  )
  try {
    let audioBytes = 0
    const noop = () => {}
    const session = await geminiProvider.connect(
      { systemPrompt: 'Say the single word: hello.', voice: 'Kore' },
      { onAudio: (pcm) => (audioBytes += pcm.length), onTranscript: noop, onInterrupted: noop, onTurnComplete: noop, onClose: noop },
    )
    const connectMs = Date.now() - started
    await new Promise((r) => setTimeout(r, 4000))
    session.close()
    return c.json({ ok: true, model: env.ai.liveModel, connectMs, audioBytes, modelList: { status: modelList.status, ms: modelList.ms } })
  } catch (err) {
    return c.json({
      ok: false,
      model: env.ai.liveModel,
      error: err instanceof Error ? err.message : String(err),
      modelList: { status: modelList.status, sample: 'sample' in modelList ? modelList.sample : modelList.error },
    })
  }
})

/** What is configured, without revealing any secret values. */
diagRoutes.get('/config', (c) => {
  if (!env.showCodes) return c.json({ error: 'not_found' }, 404)
  return c.json({
    database: dbStatus.kind === 'postgresql' ? 'postgresql (permanent)' : 'embedded (temporary)',
    databaseUrlSet: Boolean(env.databaseUrl),
    databaseError: dbStatus.error ?? null,
    email: emailConfigured ? (env.email.resendKey ? 'api' : 'smtp') : 'not configured',
    emailFrom: env.email.from || null,
    voice: env.ai.geminiKey ? 'configured' : 'not configured',
    testMode: env.showCodes,
  })
})

diagRoutes.get('/net', async (c) => {
  if (!env.showCodes) return c.json({ error: 'not_found' }, 404)
  const entries = await Promise.all(
    Object.entries(TARGETS).map(async ([name, url]) => [name, await probe(url)] as const),
  )
  return c.json(Object.fromEntries(entries))
})
