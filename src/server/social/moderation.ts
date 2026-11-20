import { COMMENT_MAX_LENGTH } from '../../shared/feed'
import { askJson, clip, textAiAvailable } from '../ai/text'

interface Verdict {
  ok?: unknown
  better?: unknown
}

/**
 * Has the AI read a comment, a post or a private message before it goes out: is it fit for a learning community, and is
 * its English right? Without an AI the comment is let through; reports and the admin panel remain.
 */
export async function review(text: string, maxLength = COMMENT_MAX_LENGTH): Promise<{ ok: boolean; better: string | null }> {
  if (!textAiAvailable()) return { ok: true, better: null }
  try {
    const verdict = await askJson<Verdict>({
      system: `You check one comment, short post or private message before it is sent in an English-learning app for adults. They are written by learners, usually in English, sometimes in Russian.
Return one JSON object: {"ok": true or false, "better": string or null}.
- "ok" is false only if the comment contains insults, harassment, hate, sexual content, threats, spam or advertising, links, or personal contact details (phone numbers, emails, messenger names). Disagreement, jokes and mistakes are fine.
- "better": if the comment is in English and has a real mistake in grammar, word choice or spelling, the same comment rewritten correctly, changing as little as possible. If it is already correct, is not in English, or "ok" is false, null. Ignore missing capital letters and final punctuation.`,
      turns: [{ role: 'student', text }],
      temperature: 0,
      timeoutMs: 12_000,
      mock: () => ({ ok: !/badword/i.test(text), better: /\bi am agree\b/i.test(text) ? text.replace(/\bi am agree\b/i, 'I agree') : null }),
    })
    const better = clip(verdict.better, maxLength)
    return { ok: verdict.ok !== false, better: better && better !== text ? better : null }
  } catch (err) {
    console.error('Comment check failed:', err instanceof Error ? err.message : err)
    return { ok: true, better: null }
  }
}
