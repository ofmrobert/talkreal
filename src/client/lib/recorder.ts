import { WAVEFORM_BARS } from '../../shared/social'

/**
 * Recording a voice message or a video note in the browser.
 * MP4 is asked for first because every phone can play it; browsers that cannot record MP4 give WebM.
 */

export type RecordKind = 'voice' | 'video'

export interface Recorded {
  blob: Blob
  seconds: number
  /** Voice only: WAVEFORM_BARS digits 0-9. */
  waveform: string | null
}

const FORMATS: Record<RecordKind, string[]> = {
  voice: ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'],
  video: ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'],
}

export function canRecord(): boolean {
  return typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

/** Asks for the microphone, and for the front camera too for a video note. Throws if the student says no. */
export function openStream(kind: RecordKind): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    video: kind === 'video' ? { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 }, aspectRatio: { ideal: 1 } } : false,
  })
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop())
}

/** Turns the loudness measured during a recording into the bars of its picture. */
export function toWaveform(levels: number[]): string {
  if (levels.length === 0) return '1'.repeat(WAVEFORM_BARS)
  const peak = Math.max(0.04, ...levels)
  let out = ''
  for (let i = 0; i < WAVEFORM_BARS; i++) {
    const from = Math.floor((i * levels.length) / WAVEFORM_BARS)
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / WAVEFORM_BARS))
    out += String(Math.min(9, Math.round((Math.max(...levels.slice(from, to)) / peak) * 9)))
  }
  return out
}

export class Recorder {
  private recorder: MediaRecorder
  private chunks: Blob[] = []
  private startedAt = 0
  private levels: number[] = []
  private context: AudioContext | null = null
  private meter: ReturnType<typeof setInterval> | undefined

  /** `onLevel` gets the loudness of the microphone, 0 to 1, many times a second. */
  constructor(
    private stream: MediaStream,
    private kind: RecordKind,
    private onLevel?: (level: number) => void,
  ) {
    const mimeType = FORMATS[kind].find((type) => MediaRecorder.isTypeSupported(type))
    this.recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000, ...(kind === 'video' ? { videoBitsPerSecond: 450_000 } : {}) })
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data)
    }
  }

  start(): void {
    this.recorder.start(250)
    this.startedAt = performance.now()
    try {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const context = new AudioCtx()
      this.context = context
      void context.resume()
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      context.createMediaStreamSource(this.stream).connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)
      this.meter = setInterval(() => {
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) sum += ((sample - 128) / 128) ** 2
        const level = Math.min(1, Math.sqrt(sum / samples.length) * 4)
        this.levels.push(level)
        this.onLevel?.(level)
      }, 60)
    } catch {
      // No loudness picture then; the recording itself is not affected.
    }
  }

  get seconds(): number {
    return this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0
  }

  /** Ends the recording and gives the file. */
  stop(): Promise<Recorded> {
    const seconds = Math.max(1, Math.round(this.seconds))
    return new Promise((resolve) => {
      this.recorder.onstop = () => {
        const type = this.recorder.mimeType.split(';')[0] || (this.kind === 'voice' ? 'audio/webm' : 'video/webm')
        resolve({ blob: new Blob(this.chunks, { type }), seconds, waveform: this.kind === 'voice' ? toWaveform(this.levels) : null })
      }
      this.release()
    })
  }

  /** Ends the recording and throws it away. */
  cancel(): void {
    this.recorder.onstop = null
    this.release()
  }

  private release(): void {
    clearInterval(this.meter)
    if (this.recorder.state !== 'inactive') this.recorder.stop()
    void this.context?.close().catch(() => {})
    this.context = null
  }
}

export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
