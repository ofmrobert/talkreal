/** Tiny sound effects made in code (no audio files). Silent if the browser refuses audio. */
let ctx: AudioContext | null = null

function tone(frequency: number, startAt: number, duration: number, volume = 0.12) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = frequency
  gain.gain.setValueAtTime(volume, ctx.currentTime + startAt)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + duration)
  osc.connect(gain).connect(ctx.destination)
  osc.start(ctx.currentTime + startAt)
  osc.stop(ctx.currentTime + startAt + duration)
}

function play(notes: [frequency: number, startAt: number, duration: number][]) {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    for (const [frequency, startAt, duration] of notes) tone(frequency, startAt, duration)
  } catch {
    // Sound is a nicety; never let it break a lesson.
  }
}

export const playCorrect = () => play([[660, 0, 0.12], [880, 0.1, 0.18]])
export const playWrong = () => play([[220, 0, 0.22]])
export const playComplete = () => play([[523, 0, 0.14], [659, 0.13, 0.14], [784, 0.26, 0.14], [1047, 0.39, 0.3]])
