/**
 * Reads English text aloud with the phone's built-in voices.
 * No audio files and no network are needed, so it also works offline.
 */
const PREFERRED = ['Samantha', 'Daniel', 'Karen', 'Google US English', 'Google UK English Female', 'Microsoft Aria']

let voice: SpeechSynthesisVoice | null = null

function pickVoice() {
  const english = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'))
  voice =
    PREFERRED.map((name) => english.find((v) => v.name.includes(name))).find(Boolean) ??
    english.find((v) => v.localService) ??
    english[0] ??
    null
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

if (canSpeak()) {
  pickVoice()
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice)
}

/** Speaks the text. slow = true reads it at a learner-friendly pace. */
export function speak(text: string, slow = false): void {
  if (!canSpeak()) return
  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = voice?.lang ?? 'en-US'
  if (voice) utterance.voice = voice
  utterance.rate = slow ? 0.6 : 0.92
  speechSynthesis.speak(utterance)
}

export function stopSpeaking(): void {
  if (canSpeak()) speechSynthesis.cancel()
}
