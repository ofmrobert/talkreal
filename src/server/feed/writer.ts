import Anthropic from '@anthropic-ai/sdk'
import { askJson, textAiAvailable } from '../ai/text'
import { env } from '../env'

/**
 * Who writes the daily posts. Claude, if an Anthropic key is set (ANTHROPIC_API_KEY); otherwise
 * the same Gemini text AI the rest of the app uses. If Claude cannot be reached (Anthropic does
 * not serve every country directly: set ANTHROPIC_BASE_URL to a relay if needed), Gemini is tried.
 */

// The key and, optionally, ANTHROPIC_BASE_URL are read from the environment by the SDK itself.
const claude = env.feed.anthropicKey ? new Anthropic({ maxRetries: 1, timeout: 60_000 }) : null

export function writerName(): 'claude' | 'gemini' | 'mock' | null {
  if (env.ai.voiceProvider === 'mock') return 'mock'
  if (claude) return 'claude'
  return textAiAvailable() ? 'gemini' : null
}

function parse<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(cleaned) as T
}

async function askClaude<T>(system: string, prompt: string): Promise<T> {
  const response = await claude!.messages.create({
    model: env.feed.claudeModel,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: prompt }],
  })
  if (response.stop_reason === 'refusal') throw new Error('Claude declined to write this post')
  const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
  if (!text) throw new Error('Claude gave an empty answer')
  return parse<T>(text)
}

/** Asks the writer for one JSON object. Returns it together with who wrote it. */
export async function write<T>(system: string, prompt: string, mock: () => T): Promise<{ value: T; by: string }> {
  const name = writerName()
  if (name === 'mock') return { value: mock(), by: 'mock' }
  if (name === 'claude') {
    try {
      return { value: await askClaude<T>(system, prompt), by: 'claude' }
    } catch (err) {
      const reason = err instanceof Anthropic.APIError ? `${err.status ?? 'no answer'} ${err.message}` : err instanceof Error ? err.message : String(err)
      console.error('Claude could not write the post:', reason.slice(0, 300))
      if (!textAiAvailable()) throw err
    }
  }
  if (!textAiAvailable()) throw new Error('No AI is configured to write posts')
  return { value: await askJson<T>({ system, turns: [{ role: 'student', text: prompt }], temperature: 0.9, timeoutMs: 40_000, mock }), by: 'gemini' }
}

/**
 * Draws a picture for a post with Google's image model, through the same route as the other
 * Gemini calls. Returns null if no picture could be made: the post then goes out without one.
 */
export async function drawPicture(description: string): Promise<{ mime: string; data: string } | null> {
  if (env.ai.voiceProvider === 'mock' || !env.ai.geminiKey) return null
  try {
    const base = env.ai.geminiWsBase.replace(/^ws/, 'http')
    const res = await fetch(`${base}/v1beta/models/${env.feed.imageModel}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.ai.geminiKey },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${description}\n\nStyle: a warm, friendly flat illustration with clear shapes and soft colours. Square. No text, letters or numbers anywhere in the picture.` }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    })
    if (!res.ok) throw new Error(`the image AI answered ${res.status}: ${(await res.text()).slice(0, 160)}`)
    const data = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] }
    const image = (data.candidates?.[0]?.content?.parts ?? []).find((part) => part.inlineData?.data)?.inlineData
    // Anything huge would bloat the database; a post is fine without its picture.
    if (!image?.data || image.data.length > 4_000_000) return null
    return { mime: image.mimeType ?? 'image/png', data: image.data }
  } catch (err) {
    console.error('Could not draw a picture for the feed:', err instanceof Error ? err.message : err)
    return null
  }
}
