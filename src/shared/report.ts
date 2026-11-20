/** The teacher's short review of a voice call, written by the AI after the student hangs up. */
export interface CallReport {
  /** What the student did well. In Russian. */
  summary: string
  /** The student's most useful mistakes: what they said, the correct version, and why (in Russian). */
  corrections: { said: string; better: string; why: string }[]
  /** Words from the call worth remembering. They join the student's review cycle. */
  words: { en: string; ru: string; example: string }[]
  /** What to practise next. In Russian. */
  tip: string
}

/** none = the call was too short to review; pending = being written; failed = the AI could not be reached. */
export type ReportStatus = 'none' | 'pending' | 'ready' | 'failed'
