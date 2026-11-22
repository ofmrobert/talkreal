import { env } from '../env'

/**
 * The text AI (Google Gemini): used for the review after a call, text chat with a teacher and
 * checking typed translations. It is reached the same way as voice calls: directly, or through
 * the relay if one is configured.
 */

export interface Turn {
  role: 'student' | 'teacher'
  text: string
}

interface Request<T> {
  /** Who the AI is and what it must return. */
  system: string
  turns: Turn[]
  /** 0 = always the same careful answer; higher = livelier. */
  temperature?: number
  timeoutMs?: number
  /**
   * A simple check that needs no deep thought: asked of the cheap model, without paid "thinking".
   * If the cheap model refuses the request, the main model is asked instead.
   */
  light?: boolean
  /** The answer used in test mode (VOICE_PROVIDER=mock), when no real AI is called. */
  mock: () => T
}

const isMock = () => env.ai.voiceProvider === 'mock'

/** True when the text AI can be used: a key is set, or the server runs with the stand-in AI. */
export function textAiAvailable(): boolean {
  return isMock() || Boolean(env.ai.geminiKey)
}

/** Takes the JSON out of an answer, even if the AI wrapped it in a code block. */
function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(cleaned)
}

/** Asks the AI a question whose answer is a JSON object. Throws if the AI cannot be reached or answers badly. */
export async function askJson<T>(request: Request<T>): Promise<T> {
  if (isMock()) return request.mock()
  if (!env.ai.geminiKey) throw new Error('The text AI is not configured')

  const base = env.ai.geminiWsBase.replace(/^ws/, 'http')
  // A light check tries the cheap model first (it does not think unless asked), then the main model
  // thinking as little as it can, then the main model as it is: so a check is never lost to a setting Google refuses.
  const attempts: { model: string; thinking?: 'low' }[] =
    request.light && env.ai.checkModel && env.ai.checkModel !== env.ai.textModel
      ? [{ model: env.ai.checkModel }, { model: env.ai.textModel, thinking: 'low' }, { model: env.ai.textModel }]
      : request.light
        ? [{ model: env.ai.textModel, thinking: 'low' }, { model: env.ai.textModel }]
        : [{ model: env.ai.textModel }]
  let res: Response | null = null
  for (const [i, attempt] of attempts.entries()) {
    res = await fetch(`${base}/v1beta/models/${attempt.model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.ai.geminiKey },
      signal: AbortSignal.timeout(request.timeoutMs ?? 20_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents: request.turns.map((turn) => ({
          role: turn.role === 'teacher' ? 'model' : 'user',
          parts: [{ text: turn.text }],
        })),
        generationConfig: { responseMimeType: 'application/json', temperature: request.temperature ?? 0.4, ...(attempt.thinking ? { thinkingConfig: { thinkingLevel: attempt.thinking } } : {}) },
      }),
    })
    // 400 and 404 mean "not this model" or "not this setting": the next attempt may work. Anything else would fail again.
    if (res.ok || (res.status !== 400 && res.status !== 404) || i === attempts.length - 1) break
    console.error(`The text AI (${attempt.model}) answered ${res.status}, trying the next: ${(await res.text()).slice(0, 200)}`)
  }
  if (!res || !res.ok) throw new Error(`The text AI answered ${res?.status}: ${(await res?.text())?.slice(0, 200)}`)

  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('')
  if (!text) throw new Error('The text AI gave an empty answer')
  return parseJson(text) as T
}

/** Shortens a text the AI returned, so a runaway answer cannot fill the screen or the database. */
export function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}
