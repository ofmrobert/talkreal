import WebSocket from 'ws'
import { env } from '../env'
import type { VoiceHandlers, VoiceOptions, VoiceProvider, VoiceSession } from './provider'

const PATH = '/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
const SETUP_TIMEOUT_MS = 15_000

interface ServerMessage {
  setupComplete?: object
  serverContent?: {
    modelTurn?: { parts?: { inlineData?: { data: string } }[] }
    inputTranscription?: { text?: string }
    outputTranscription?: { text?: string }
    interrupted?: boolean
    turnComplete?: boolean
  }
  goAway?: object
  error?: { message?: string }
}

/** Google Gemini Live: one WebSocket per call, audio in and out as base64 inside JSON. */
export const geminiProvider: VoiceProvider = {
  name: 'gemini',
  outputSampleRate: 24_000,

  connect(options: VoiceOptions, handlers: VoiceHandlers): Promise<VoiceSession> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${env.ai.geminiWsBase}${PATH}?key=${env.ai.geminiKey}`)
      let ready = false
      let closed = false

      const failSetup = (message: string) => {
        if (ready || closed) return
        closed = true
        ws.terminate()
        reject(new Error(message))
      }
      const timer = setTimeout(() => failSetup('The AI did not answer in time'), SETUP_TIMEOUT_MS)

      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            setup: {
              model: `models/${env.ai.liveModel}`,
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: options.voice } } },
              },
              systemInstruction: { parts: [{ text: options.systemPrompt }] },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              // Learners pause to think: wait a little longer before deciding they have finished.
              realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 900 } },
            },
          }),
        )
      })

      ws.on('message', (raw) => {
        let message: ServerMessage
        try {
          message = JSON.parse(raw.toString())
        } catch {
          return
        }

        if (message.setupComplete && !ready) {
          ready = true
          clearTimeout(timer)
          // Ask the teacher to speak first.
          ws.send(JSON.stringify({ realtimeInput: { text: 'The student has just joined the call. Greet them and begin.' } }))
          resolve({
            sendAudio(pcm) {
              if (ws.readyState !== WebSocket.OPEN) return
              ws.send(
                JSON.stringify({
                  realtimeInput: { audio: { data: pcm.toString('base64'), mimeType: 'audio/pcm;rate=16000' } },
                }),
              )
            },
            close() {
              closed = true
              ws.close()
            },
          })
          return
        }

        const content = message.serverContent
        if (!content) return
        for (const part of content.modelTurn?.parts ?? []) {
          if (part.inlineData?.data) handlers.onAudio(Buffer.from(part.inlineData.data, 'base64'))
        }
        if (content.inputTranscription?.text) handlers.onTranscript('student', content.inputTranscription.text)
        if (content.outputTranscription?.text) handlers.onTranscript('teacher', content.outputTranscription.text)
        if (content.interrupted) handlers.onInterrupted()
        if (content.turnComplete) handlers.onTurnComplete()
      })

      ws.on('error', (err) => {
        console.error('Gemini voice error:', err.message)
        failSetup(err.message)
      })

      ws.on('close', (code, reason) => {
        clearTimeout(timer)
        if (!ready) {
          // Google explains refusals (bad key, unsupported region, unknown model) in the close reason.
          failSetup(`The AI closed the connection (${code}): ${reason.toString() || 'no reason given'}`)
        } else if (!closed) {
          closed = true
          handlers.onClose(code === 1000 ? 'provider_closed' : 'provider_error')
        }
      })
    })
  },
}
