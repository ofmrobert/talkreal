// Runs on the audio thread. Takes the microphone signal at the phone's own sample rate,
// converts it to 16 kHz 16-bit mono, and posts it to the app in chunks of about 100 ms,
// together with a loudness value for the mic animation.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.step = sampleRate / 16000
    this.position = 0
    this.sum = 0
    this.count = 0
    this.chunk = new Int16Array(1600)
    this.filled = 0
    this.energy = 0
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel) return true

    for (let i = 0; i < channel.length; i++) {
      // Average the input samples that fall into one output sample (simple, clean downsampling).
      this.sum += channel[i]
      this.count++
      this.position++
      if (this.position >= this.step) {
        this.position -= this.step
        const sample = Math.max(-1, Math.min(1, this.sum / this.count))
        this.sum = 0
        this.count = 0
        this.energy += sample * sample
        this.chunk[this.filled++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
        if (this.filled === this.chunk.length) {
          const level = Math.sqrt(this.energy / this.filled)
          const out = this.chunk.buffer.slice(0)
          this.port.postMessage({ pcm: out, level }, [out])
          this.filled = 0
          this.energy = 0
        }
      }
    }
    return true
  }
}

registerProcessor('capture', CaptureProcessor)
