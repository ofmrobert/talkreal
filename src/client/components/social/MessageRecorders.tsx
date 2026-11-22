import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { VIDEO_MAX_SECONDS, VOICE_MAX_SECONDS } from '../../../shared/social'
import { canRecord, clock, openStream, Recorder, stopStream, type Recorded } from '../../lib/recorder'
import { PlayIcon, Ring, SendIcon, StopIcon, TrashIcon, VoicePlayer } from './MessageMedia'

type Send = (recorded: Recorded) => Promise<string | null>

const Spinner = () => <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-white/40 border-t-white" aria-hidden="true" />

/**
 * Takes the place of the box to write while a voice message is recorded. Recording starts at
 * once. "Stop" lets the student hear themselves before sending; the arrow sends straight away.
 */
export function VoiceRecorderBar({ onSend, onClose }: { onSend: Send; onClose: () => void }) {
  const { t } = useTranslation()
  const [state, setState] = useState<'starting' | 'recording' | 'preview' | 'sending' | 'denied'>('starting')
  const [seconds, setSeconds] = useState(0)
  const [levels, setLevels] = useState<number[]>([])
  const [recorded, setRecorded] = useState<Recorded | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recorder = useRef<Recorder | null>(null)
  const stream = useRef<MediaStream | null>(null)

  useEffect(() => {
    let gone = false
    if (!canRecord()) setState('denied')
    else
      openStream('voice')
        .then((media) => {
          if (gone) return stopStream(media)
          stream.current = media
          recorder.current = new Recorder(media, 'voice', (level) => setLevels((now) => [...now.slice(-31), level]))
          recorder.current.start()
          setState('recording')
        })
        .catch(() => !gone && setState('denied'))
    return () => {
      gone = true
      recorder.current?.cancel()
      stopStream(stream.current)
    }
  }, [])
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])

  async function finish(): Promise<Recorded | null> {
    if (!recorder.current) return null
    const result = await recorder.current.stop()
    recorder.current = null
    stopStream(stream.current)
    setRecorded(result)
    setUrl(URL.createObjectURL(result.blob))
    return result
  }
  async function send(ready: Recorded | null) {
    if (!ready) return
    setState('sending')
    setError(null)
    const problem = await onSend(ready)
    if (problem) {
      setError(problem)
      setState('preview')
    }
  }
  // The clock, and the end of the allowed time: the recording stops and waits to be sent.
  useEffect(() => {
    if (state !== 'recording') return
    const timer = setInterval(() => {
      const now = recorder.current?.seconds ?? 0
      setSeconds(now)
      if (now >= VOICE_MAX_SECONDS) void finish().then(() => setState('preview'))
    }, 200)
    return () => clearInterval(timer)
  }, [state])

  const round = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl active:translate-y-0.5'
  if (state === 'denied')
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-card p-3">
        <p className="flex-1 text-sm font-bold leading-snug text-ink/70">{t(canRecord() ? 'social.chat.micDenied' : 'social.chat.cantRecord')}</p>
        <button type="button" onClick={onClose} className="min-h-10 rounded-xl px-3 text-sm font-extrabold text-coral-ink">
          OK
        </button>
      </div>
    )
  return (
    <div className="flex flex-col gap-1.5">
      {error && (
        <p role="alert" className="px-1 text-sm font-bold text-bad-ink">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="button" onClick={onClose} disabled={state === 'sending'} aria-label={t('social.chat.delete')} className={`${round} bg-card text-ink/55`}>
          <TrashIcon />
        </button>
        <div className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-2xl border-2 border-ink/10 bg-card px-3">
          {state === 'preview' || state === 'sending' ? (
            recorded && url && <VoicePlayer src={url} seconds={recorded.seconds} waveform={recorded.waveform} tone="theirs" compact />
          ) : (
            <>
              <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-bad" aria-hidden="true" />
              <span className="w-10 shrink-0 text-base font-extrabold tabular-nums" role="timer">
                {clock(seconds)}
              </span>
              <span className="flex h-7 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden" aria-hidden="true">
                {levels.map((level, i) => (
                  <span key={i} className="w-[3px] shrink-0 rounded-full bg-coral" style={{ height: `${12 + level * 88}%` }} />
                ))}
              </span>
              <span className="shrink-0 text-xs font-bold tabular-nums text-ink/35">{clock(VOICE_MAX_SECONDS)}</span>
            </>
          )}
        </div>
        {state === 'recording' && (
          <button type="button" onClick={() => void finish().then(() => setState('preview'))} aria-label={t('social.chat.stop')} className={`${round} bg-card text-bad-ink`}>
            <StopIcon />
          </button>
        )}
        <button
          type="button"
          disabled={state === 'starting' || state === 'sending'}
          onClick={() => void (state === 'recording' ? finish().then(send) : send(recorded))}
          aria-label={t('chat.send')}
          className={`${round} bg-coral text-white shadow-[0_4px_0_0_var(--color-coral-dark)] active:translate-y-1 disabled:opacity-60`}
        >
          {state === 'sending' ? <Spinner /> : <SendIcon />}
        </button>
      </div>
    </div>
  )
}

/**
 * The screen for a video note: the student sees themselves in a circle, taps to record, taps
 * to stop, watches it once more, then sends it or records again.
 */
export function VideoNoteRecorder({ onSend, onClose }: { onSend: Send; onClose: () => void }) {
  const { t } = useTranslation()
  const [state, setState] = useState<'starting' | 'ready' | 'recording' | 'preview' | 'sending' | 'denied'>('starting')
  const [seconds, setSeconds] = useState(0)
  const [recorded, setRecorded] = useState<Recorded | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const live = useRef<HTMLVideoElement>(null)
  const replay = useRef<HTMLVideoElement>(null)
  const recorder = useRef<Recorder | null>(null)
  const stream = useRef<MediaStream | null>(null)

  function openCamera() {
    setState('starting')
    openStream('video')
      .then((media) => {
        stream.current = media
        setState('ready')
      })
      .catch(() => setState('denied'))
  }
  useEffect(() => {
    if (canRecord()) openCamera()
    else setState('denied')
    return () => {
      recorder.current?.cancel()
      stopStream(stream.current)
      stream.current = null
    }
  }, [])
  // The camera picture goes into the circle whenever the circle is on screen.
  useEffect(() => {
    if ((state === 'ready' || state === 'recording') && live.current && stream.current && live.current.srcObject !== stream.current) {
      live.current.srcObject = stream.current
      void live.current.play().catch(() => {})
    }
  }, [state])
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function start() {
    if (!stream.current) return
    recorder.current = new Recorder(stream.current, 'video')
    recorder.current.start()
    setSeconds(0)
    setState('recording')
  }
  async function stop() {
    if (!recorder.current) return
    const result = await recorder.current.stop()
    recorder.current = null
    stopStream(stream.current)
    stream.current = null
    setRecorded(result)
    setUrl(URL.createObjectURL(result.blob))
    setPaused(false)
    setState('preview')
  }
  useEffect(() => {
    if (state !== 'recording') return
    const timer = setInterval(() => {
      const now = recorder.current?.seconds ?? 0
      setSeconds(now)
      if (now >= VIDEO_MAX_SECONDS) void stop()
    }, 100)
    return () => clearInterval(timer)
  }, [state])

  function again() {
    setRecorded(null)
    setUrl(null)
    setError(null)
    openCamera()
  }
  async function send() {
    if (!recorded) return
    replay.current?.pause()
    setState('sending')
    setError(null)
    const problem = await onSend(recorded)
    if (problem) {
      setError(problem)
      setState('preview')
    }
  }

  const watching = state === 'preview' || state === 'sending'
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-night/[0.97] px-6 text-white" role="dialog" aria-modal="true" aria-label={t('social.chat.recordVideo')}>
      <button type="button" onClick={onClose} aria-label={t('social.back')} className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-xl font-extrabold">
        ✕
      </button>

      <div className="relative aspect-square w-full max-w-[19rem]">
        <Ring progress={state === 'recording' ? seconds / VIDEO_MAX_SECONDS : 0} className="stroke-bad" />
        <div className="absolute inset-[7px] overflow-hidden rounded-full bg-black">
          {watching && url ? (
            <>
              <video
                key="replay"
                ref={replay}
                src={url}
                playsInline
                autoPlay
                loop
                onPlay={() => setPaused(false)}
                onPause={() => setPaused(true)}
                onClick={() => (replay.current?.paused ? void replay.current.play().catch(() => {}) : replay.current?.pause())}
                className="h-full w-full object-cover"
              />
              {paused && state === 'preview' && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45">
                    <PlayIcon size={26} />
                  </span>
                </span>
              )}
            </>
          ) : state === 'denied' ? (
            <p className="flex h-full items-center justify-center px-8 text-center text-base font-bold leading-snug text-white/80">{t(canRecord() ? 'social.chat.camDenied' : 'social.chat.cantRecord')}</p>
          ) : (
            // Mirrored, like a mirror: that is how people expect to see themselves.
            <video key="live" ref={live} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
          )}
        </div>
      </div>

      <p className="h-6 text-center text-base font-extrabold tabular-nums" role={state === 'recording' ? 'timer' : undefined}>
        {state === 'recording' ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 animate-pulse rounded-full bg-bad" aria-hidden="true" />
            {clock(seconds)} / {clock(VIDEO_MAX_SECONDS)}
          </span>
        ) : state === 'ready' ? (
          <span className="text-white/70">{t('social.chat.tapToRecord', { count: VIDEO_MAX_SECONDS })}</span>
        ) : watching && recorded ? (
          <span className="text-white/70">{clock(recorded.seconds)}</span>
        ) : null}
      </p>
      {error && (
        <p role="alert" className="-mt-3 max-w-xs text-center text-sm font-bold text-sun">
          {error}
        </p>
      )}

      <div className="flex h-20 items-center justify-center gap-8">
        {state === 'ready' && (
          <button type="button" onClick={start} aria-label={t('social.chat.recordVideo')} className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white active:scale-95">
            <span className="h-14 w-14 rounded-full bg-bad" />
          </button>
        )}
        {state === 'recording' && (
          <button type="button" onClick={() => void stop()} aria-label={t('social.chat.stop')} className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white active:scale-95">
            <span className="h-8 w-8 rounded-lg bg-bad" />
          </button>
        )}
        {watching && (
          <>
            <button type="button" onClick={again} disabled={state === 'sending'} aria-label={t('social.chat.delete')} className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 active:scale-95 disabled:opacity-50">
              <TrashIcon size={24} />
            </button>
            <button type="button" onClick={() => void send()} disabled={state === 'sending'} aria-label={t('chat.send')} className="flex h-16 w-16 items-center justify-center rounded-full bg-coral shadow-[0_4px_0_0_var(--color-coral-dark)] active:translate-y-1 disabled:opacity-70">
              {state === 'sending' ? <Spinner /> : <SendIcon size={28} />}
            </button>
          </>
        )}
        {state === 'denied' && (
          <button type="button" onClick={onClose} className="min-h-12 rounded-2xl bg-white/10 px-6 text-base font-extrabold">
            OK
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
