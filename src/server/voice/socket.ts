/**
 * The live voice call between the app and the AI teacher.
 *
 *   phone  ⇄  this server  ⇄  AI provider
 *
 * The phone never talks to the AI company directly: the key stays here, and this server
 * counts every second so a call can never run past the student's allowance.
 *
 * Messages with the phone:
 *   phone → server   {type:"start", teacher, tz, scenario?, lessonId?}   then raw microphone audio (16-bit PCM, 16 kHz),
 *                    and {type:"stop"} to hang up
 *   server → phone   {type:"ready"|"transcript"|"interrupted"|"turnComplete"|"tick"|"end"}; "ready" carries the call's id,
 *                    which the app uses afterwards to ask for the teacher's review
 *                    and raw teacher audio (16-bit PCM)
 */
import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { eq } from 'drizzle-orm'
import { WebSocketServer, type WebSocket } from 'ws'
import { isLevel, type Level } from '../../shared/levels'
import { isScenario } from '../../shared/scenarios'
import { TEACHERS, type TeacherId } from '../../shared/teachers'
import type { Turn } from '../ai/text'
import { userIdFromCookieHeader } from '../auth/sessions'
import { lessonById } from '../content/lessons'
import { db } from '../db/client'
import { users, voiceSessions } from '../db/schema'
import { env } from '../env'
import { recordActivity } from '../progress/activity'
import { localDay, safeTimezone } from '../progress/streak'
import { geminiProvider } from './gemini'
import { mockProvider } from './mock'
import type { VoiceProvider, VoiceSession } from './provider'
import { worthReviewing, writeReport } from './report'
import { teacherPrompt, teacherVoice } from './teachers'
import { addVoiceSeconds, remainingVoiceSeconds } from './usage'

export const VOICE_PATH = '/api/voice/ws'
/** One call may not run longer than this (the AI provider ends audio sessions at 15 minutes). */
const MAX_CALL_SECONDS = 14 * 60
const SAVE_EVERY_SECONDS = 10
/** A call at least this long counts as practice for the day: it earns XP and keeps the streak. */
const PRACTICE_SECONDS = 60
const XP_CALL = 10
/** The transcript kept in memory for the review is cut off here, so a very long call cannot grow without end. */
const MAX_TRANSCRIPT_CHARS = 14_000

export function voiceProvider(): VoiceProvider | null {
  if (env.ai.voiceProvider === 'mock') return mockProvider
  return env.ai.geminiKey ? geminiProvider : null
}

const isTeacher = (value: unknown): value is TeacherId => TEACHERS.some((t) => t.id === value)

function runCall(socket: WebSocket, userId: string) {
  let session: VoiceSession | null = null
  let timer: NodeJS.Timeout | null = null
  let callId: string | null = null
  let day = ''
  let elapsed = 0
  let saved = 0
  let allowance = 0
  let finished = false
  let level: Level | null = null
  let timezone = ''
  /** What was said, turn by turn. Lives only in memory, for the review written when the call ends. */
  const transcript: Turn[] = []
  let transcriptChars = 0
  let newTurn = true

  function hear(role: Turn['role'], text: string) {
    if (transcriptChars >= MAX_TRANSCRIPT_CHARS) return
    transcriptChars += text.length
    const last = transcript[transcript.length - 1]
    if (last && last.role === role && !newTurn) last.text += text
    else transcript.push({ role, text })
    newTurn = false
  }

  const send = (message: object) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
  }

  async function finish(reason: string) {
    if (finished) return
    finished = true
    if (timer) clearInterval(timer)
    session?.close()
    const review = callId !== null && level !== null && worthReviewing(transcript)
    send({ type: 'end', reason, callId, review })
    socket.close()
    try {
      await addVoiceSeconds(userId, day, elapsed - saved)
      if (callId) {
        await db
          .update(voiceSessions)
          .set({ endedAt: new Date(), seconds: elapsed, endReason: reason, reportStatus: review ? 'pending' : 'none' })
          .where(eq(voiceSessions.id, callId))
      }
      if (callId && elapsed >= PRACTICE_SECONDS) {
        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
        if (user) await db.transaction((tx) => recordActivity(tx, user, { today: day, timezone, xp: XP_CALL, lessons: 0 }))
      }
    } catch (err) {
      console.error('Could not save voice usage:', err)
    }
    // Written after everything else is saved; the app asks for it a few seconds later.
    if (review && callId && level) void writeReport(callId, userId, level, transcript, day)
  }

  async function start(message: { teacher?: unknown; tz?: unknown; scenario?: unknown; lessonId?: unknown }) {
    const provider = voiceProvider()
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!provider || !user || !isLevel(user.level) || !isTeacher(message.teacher)) return finish('unavailable')

    level = user.level
    timezone = safeTimezone(message.tz ?? user.timezone)
    day = localDay(timezone)
    const lesson = typeof message.lessonId === 'string' ? lessonById(message.lessonId) : undefined
    const scenario = !lesson && isScenario(message.scenario) ? message.scenario : undefined
    allowance = Math.min(await remainingVoiceSeconds(userId, user.plan, day), MAX_CALL_SECONDS)
    if (allowance <= 0) return finish('limit')

    try {
      session = await provider.connect(
        { systemPrompt: teacherPrompt(message.teacher, user.level, { lesson, scenario }), voice: teacherVoice(message.teacher) },
        {
          onAudio: (pcm) => socket.readyState === socket.OPEN && socket.send(pcm),
          onTranscript: (role, text) => {
            hear(role, text)
            send({ type: 'transcript', role, text })
          },
          onInterrupted: () => send({ type: 'interrupted' }),
          onTurnComplete: () => {
            newTurn = true
            send({ type: 'turnComplete' })
          },
          onClose: (reason) => void finish(reason),
        },
      )
    } catch (err) {
      console.error('Voice call could not start:', err instanceof Error ? err.message : err)
      return finish('provider_error')
    }
    if (finished) return session.close()

    const [call] = await db
      .insert(voiceSessions)
      .values({ userId, teacher: message.teacher, provider: provider.name, scenario: scenario ?? null, lessonId: lesson?.id ?? null })
      .returning({ id: voiceSessions.id })
    callId = call.id

    send({ type: 'ready', remainingSeconds: allowance, sampleRate: provider.outputSampleRate, callId })

    // The clock that enforces the allowance. Usage is saved as the call goes, not only at the end.
    timer = setInterval(() => {
      elapsed++
      if (elapsed - saved >= SAVE_EVERY_SECONDS) {
        const unsaved = elapsed - saved
        saved = elapsed
        addVoiceSeconds(userId, day, unsaved).catch((err) => console.error('Could not save voice usage:', err))
      }
      send({ type: 'tick', remainingSeconds: allowance - elapsed })
      if (elapsed >= allowance) void finish(allowance >= MAX_CALL_SECONDS ? 'max_duration' : 'limit')
    }, 1000)
  }

  let started = false
  socket.on('message', (data, isBinary) => {
    if (isBinary) {
      session?.sendAudio(data as Buffer)
      return
    }
    try {
      const message = JSON.parse(data.toString())
      // An explicit "stop" ends the call at once; waiting for the connection to close can take seconds.
      if (message.type === 'stop') return void finish('hangup')
      if (message.type === 'start' && !started) {
        started = true
        start(message).catch((err) => {
          console.error('Voice call failed:', err)
          void finish('provider_error')
        })
      }
    } catch {
      // Ignore anything that is not our own message format.
    }
  })
  socket.on('close', () => void finish('hangup'))
  socket.on('error', () => void finish('hangup'))
}

/** Accepts voice-call connections on the same server and port as the rest of the app. */
export function attachVoiceSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 })

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (request.url?.split('?')[0] !== VOICE_PATH) {
      socket.destroy()
      return
    }
    userIdFromCookieHeader(request.headers.cookie)
      .then((userId) => {
        if (!userId) {
          socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
          socket.destroy()
          return
        }
        wss.handleUpgrade(request, socket, head, (ws) => runCall(ws, userId))
      })
      .catch(() => socket.destroy())
  })
}
