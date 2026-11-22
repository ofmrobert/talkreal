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
      light: true,
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

interface MediaVerdict {
  ok?: unknown
  transcript?: unknown
}

/**
 * Has the AI listen to a voice message or watch a video note before it is delivered.
 * It also writes down what it heard: the students practise pronunciation, and seeing what was
 * understood is the feedback. `checked` is false when the AI could not be asked; the recording
 * then goes out unchecked, as a text would, and the admin panel marks it.
 */
export async function reviewMedia(kind: 'voice' | 'video', mime: string, data: string): Promise<{ ok: boolean; transcript: string | null; checked: boolean }> {
  if (!textAiAvailable()) return { ok: true, transcript: null, checked: false }
  try {
    const verdict = await askJson<MediaVerdict>({
      system: `You check one ${kind === 'voice' ? 'voice message' : 'short video message'} before it is delivered in an English-learning app for adults. Learners record these to practise speaking, usually in English, sometimes in Russian.
Return one JSON object: {"ok": true or false, "transcript": string or null}.
- "ok" is false only if the recording contains insults, harassment, hate, sexual content, threats, spam or advertising, or personal contact details said aloud${kind === 'video' ? ' or shown' : ''} (phone numbers, emails, messenger names, web addresses)${kind === 'video' ? ', or if the video shows nudity, sexual content, violence or anything not fit for a learning community' : ''}. Mistakes, an accent, jokes, background noise and silence are fine.
- "transcript": the words spoken, exactly as they were said, in the language spoken. Do not correct mistakes. At most 500 characters. null if nobody speaks.`,
      turns: [{ role: 'student', text: `Check this ${kind === 'voice' ? 'voice message' : 'video message'}.` }],
      // The AI knows an audio-only MP4 as M4A.
      media: { mime: mime === 'audio/mp4' ? 'audio/m4a' : mime, data },
      temperature: 0,
      light: true,
      timeoutMs: 30_000,
      // Test mode: a file with the word "badword" in its bytes is refused.
      mock: () => (Buffer.from(data, 'base64').includes('badword') ? { ok: false, transcript: null } : { ok: true, transcript: 'I think my pronunciation is getting better.' }),
    })
    return { ok: verdict.ok !== false, transcript: clip(verdict.transcript, 500) || null, checked: true }
  } catch (err) {
    console.error('Recording check failed:', err instanceof Error ? err.message : err)
    return { ok: true, transcript: null, checked: false }
  }
}
