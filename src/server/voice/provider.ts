/**
 * The seam between Talkreal and whichever company provides the AI voice.
 * To switch provider (for example to OpenAI Realtime), write one more file that
 * implements VoiceProvider; nothing else in the app changes.
 */
export interface VoiceHandlers {
  /** Speech from the teacher: 16-bit PCM, mono. */
  onAudio(pcm: Buffer): void
  /** A piece of text for the live transcript. Pieces of one turn arrive in order. */
  onTranscript(role: 'student' | 'teacher', text: string): void
  /** The student started talking over the teacher: stop playing queued audio. */
  onInterrupted(): void
  onTurnComplete(): void
  onClose(reason: 'provider_closed' | 'provider_error'): void
}

export interface VoiceOptions {
  systemPrompt: string
  voice: string
}

export interface VoiceSession {
  /** Microphone audio from the student: 16-bit PCM, mono, 16 kHz. */
  sendAudio(pcm: Buffer): void
  close(): void
}

export interface VoiceProvider {
  name: string
  /** Sample rate of the audio passed to onAudio. */
  outputSampleRate: number
  connect(options: VoiceOptions, handlers: VoiceHandlers): Promise<VoiceSession>
}
