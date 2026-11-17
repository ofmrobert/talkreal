import type { VoiceHandlers, VoiceOptions, VoiceProvider, VoiceSession } from './provider'

const RATE = 24_000

/** Half a second of a soft tone, standing in for the teacher's voice. */
function tone(): Buffer {
  const samples = RATE / 2
  const pcm = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i++) {
    const fade = Math.min(1, i / 800, (samples - i) / 800)
    pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / RATE) * 6000 * fade), i * 2)
  }
  return pcm
}

/**
 * A stand-in for the real AI (VOICE_PROVIDER=mock). It greets, then "answers" each time it has
 * received about two seconds of microphone audio. Used to test the app without spending money.
 */
export const mockProvider: VoiceProvider = {
  name: 'mock',
  outputSampleRate: RATE,

  async connect(_options: VoiceOptions, handlers: VoiceHandlers): Promise<VoiceSession> {
    let received = 0
    let turn = 0
    let open = true

    const speak = (text: string) => {
      if (!open) return
      handlers.onTranscript('teacher', text)
      handlers.onAudio(tone())
      handlers.onTurnComplete()
    }
    setTimeout(() => speak('Hello! This is a test teacher. Say something.'), 300)

    return {
      sendAudio(pcm) {
        received += pcm.length
        if (received >= 16_000 * 2 * 2) {
          received = 0
          turn++
          handlers.onTranscript('student', `(test speech ${turn})`)
          speak(`I heard you. That was turn number ${turn}.`)
        }
      },
      close() {
        open = false
      },
    }
  },
}
