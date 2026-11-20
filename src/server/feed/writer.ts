import { askJson, textAiAvailable } from '../ai/text'
import { env } from '../env'

/**
 * Who writes the daily posts: the same Gemini text AI the rest of the app uses.
 * (Anthropic does not serve Russia, where the server is, so Claude is not an option here.)
 */

export function writerName(): 'gemini' | 'mock' | null {
  if (env.ai.voiceProvider === 'mock') return 'mock'
  return textAiAvailable() ? 'gemini' : null
}

/** Asks the writer for one JSON object. Returns it together with who wrote it. */
export async function write<T>(system: string, prompt: string, mock: () => T): Promise<{ value: T; by: string }> {
  const name = writerName()
  if (name === 'mock') return { value: mock(), by: 'mock' }
  if (!name) throw new Error('No AI is configured to write posts')
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
