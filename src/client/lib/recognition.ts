/**
 * Turns the student's speech into text with the browser's own speech recognition.
 * Not every browser has it (Firefox does not), so always check canRecognize() first.
 */

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((event: RecognitionResultEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}

type RecognitionClass = new () => Recognition

function recognitionClass(): RecognitionClass | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function canRecognize(): boolean {
  return recognitionClass() !== undefined
}

/** Why listening failed: the microphone is not allowed, or something else went wrong. */
export type ListenProblem = 'blocked' | 'failed'

interface Handlers {
  /** Everything the recogniser thinks it may have heard, best guess first. Empty if nothing was heard. */
  onHeard: (alternatives: string[]) => void
  onProblem: (problem: ListenProblem) => void
}

/** Listens for one English phrase. Returns a function that stops listening. */
export function listenOnce({ onHeard, onProblem }: Handlers): () => void {
  const Recognition = recognitionClass()
  if (!Recognition) {
    onProblem('failed')
    return () => {}
  }

  const recognition = new Recognition()
  let finished = false
  const finish = (report: () => void) => {
    if (finished) return
    finished = true
    report()
  }

  recognition.lang = 'en-US'
  recognition.interimResults = false
  recognition.continuous = false
  recognition.maxAlternatives = 5
  recognition.onresult = (event) => {
    const alternatives: string[] = []
    for (let r = 0; r < event.results.length; r++) {
      for (let a = 0; a < event.results[r].length; a++) alternatives.push(event.results[r][a].transcript)
    }
    finish(() => onHeard(alternatives))
  }
  recognition.onerror = (event) => {
    // Silence is not a breakdown: the student simply gets another try.
    if (event.error === 'no-speech' || event.error === 'aborted') finish(() => onHeard([]))
    else finish(() => onProblem(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'blocked' : 'failed'))
  }
  recognition.onend = () => finish(() => onHeard([]))

  try {
    recognition.start()
  } catch {
    finish(() => onProblem('failed'))
  }

  return () => {
    finished = true
    try {
      recognition.abort()
    } catch {
      // Already stopped.
    }
  }
}
