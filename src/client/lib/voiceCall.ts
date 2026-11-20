/**
 * One live voice call: microphone → our server → AI teacher → speaker.
 * The screen only reacts to the events below; all audio plumbing lives here.
 */
export type EndReason = 'hangup' | 'limit' | 'max_duration' | 'unavailable' | 'provider_error' | 'provider_closed' | 'mic_denied' | 'connection'

export interface CallEvents {
  /** callId identifies this call when asking for the teacher's review afterwards. */
  onReady(remainingSeconds: number, callId: string | null): void
  onTranscript(role: 'student' | 'teacher', text: string): void
  onTurnComplete(): void
  onTick(remainingSeconds: number): void
  /** Loudness of the microphone, 0–1, about ten times a second. */
  onMicLevel(level: number): void
  onTeacherSpeaking(speaking: boolean): void
  onEnd(reason: EndReason): void
}

export class VoiceCall {
  private context: AudioContext | null = null
  private stream: MediaStream | null = null
  private socket: WebSocket | null = null
  private playing = new Set<AudioBufferSourceNode>()
  private playAt = 0
  private outputRate = 24_000
  private live = false
  private ended = false
  muted = false

  constructor(
    private teacher: string,
    private events: CallEvents,
    /** What the call is about: a role-play or a lesson to practise. Empty = free conversation. */
    private topic: { scenario?: string; lessonId?: string } = {},
  ) {}

  /** Must be called from a tap: phones only allow the microphone and audio after a user gesture. */
  async start(): Promise<void> {
    try {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.context = new AudioCtx()
      await this.context.resume()
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      })
    } catch {
      return this.finish('mic_denied')
    }

    try {
      await this.context.audioWorklet.addModule('/voice-worklet.js')
    } catch {
      return this.finish('connection')
    }
    if (this.ended) return

    const capture = new AudioWorkletNode(this.context, 'capture')
    capture.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
      this.events.onMicLevel(this.muted ? 0 : Math.min(1, event.data.level * 6))
      if (this.live && !this.muted && this.socket?.readyState === WebSocket.OPEN) this.socket.send(event.data.pcm)
    }
    // The capture node must be connected to the output to keep running; the silent gain stops us hearing ourselves.
    const silent = this.context.createGain()
    silent.gain.value = 0
    this.context.createMediaStreamSource(this.stream).connect(capture).connect(silent).connect(this.context.destination)

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${protocol}//${location.host}/api/voice/ws`)
    socket.binaryType = 'arraybuffer'
    this.socket = socket

    socket.onopen = () =>
      socket.send(
        JSON.stringify({ type: 'start', teacher: this.teacher, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, ...this.topic }),
      )
    socket.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) return this.play(event.data)
      const message = JSON.parse(event.data as string)
      switch (message.type) {
        case 'ready':
          this.live = true
          this.outputRate = message.sampleRate ?? 24_000
          this.events.onReady(message.remainingSeconds, message.callId ?? null)
          break
        case 'transcript':
          this.events.onTranscript(message.role, message.text)
          break
        case 'turnComplete':
          this.events.onTurnComplete()
          break
        case 'interrupted':
          this.stopPlayback()
          break
        case 'tick':
          this.events.onTick(message.remainingSeconds)
          break
        case 'end':
          this.finish(message.reason)
          break
      }
    }
    socket.onclose = () => this.finish(this.live ? 'provider_closed' : 'connection')
    socket.onerror = () => this.finish('connection')
  }

  /** Queues a piece of the teacher's speech so pieces play back to back without gaps. */
  private play(data: ArrayBuffer) {
    const context = this.context
    if (!context || this.ended) return
    const samples = new Int16Array(data)
    if (samples.length === 0) return
    const buffer = context.createBuffer(1, samples.length, this.outputRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 0x8000

    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    this.playAt = Math.max(this.playAt, context.currentTime + 0.05)
    source.start(this.playAt)
    this.playAt += buffer.duration

    if (this.playing.size === 0) this.events.onTeacherSpeaking(true)
    this.playing.add(source)
    source.onended = () => {
      this.playing.delete(source)
      if (this.playing.size === 0) this.events.onTeacherSpeaking(false)
    }
  }

  private stopPlayback() {
    for (const source of this.playing) {
      source.onended = null
      try {
        source.stop()
      } catch {
        // Already stopped.
      }
    }
    this.playing.clear()
    this.playAt = 0
    this.events.onTeacherSpeaking(false)
  }

  hangUp() {
    this.finish('hangup')
  }

  private finish(reason: EndReason) {
    if (this.ended) return
    this.ended = true
    this.live = false
    this.stopPlayback()
    this.stream?.getTracks().forEach((track) => track.stop())
    if (this.socket) {
      // Tell the server right away, so the minute counter stops the moment the student hangs up.
      if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'stop' }))
      this.socket.onclose = null
      this.socket.onerror = null
      this.socket.close()
    }
    void this.context?.close().catch(() => {})
    this.events.onEnd(reason)
  }
}
