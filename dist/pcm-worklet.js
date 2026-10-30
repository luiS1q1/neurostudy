// AudioWorklet: 16 kHz mono PCM16 capture + RMS amplitude for the orb / barge-in
class PCM16k extends AudioWorkletProcessor {
  constructor() {
    super()
    this.acc = []           // accumulated input samples for current 16k sample
    this.ratio = sampleRate / 16000
    this.buf = []           // 16k samples pending send
    this.thresh = 40        // samples per post batch
  }
  process(inputs) {
    const ch = inputs[0][0]
    if (!ch) return true
    let sum = 0
    for (const s of ch) sum += s * s
    const rms = Math.sqrt(sum / ch.length)
    for (const s of ch) {
      this.acc.push(s)
      if (this.acc.length >= this.ratio) {
        let v = 0
        for (const a of this.acc) v += a
        this.buf.push(v / this.acc.length)
        this.acc = []
        if (this.buf.length >= this.thresh) {
          const out = new Int16Array(this.buf.length)
          for (let i = 0; i < this.buf.length; i++) {
            const c = Math.max(-1, Math.min(1, this.buf[i]))
            out[i] = c < 0 ? c * 0x8000 : c * 0x7fff
          }
          this.port.postMessage({ pcm: out, rms }, [out.buffer])
          this.buf = []
        }
      }
    }
    return true
  }
}
registerProcessor('pcm16k', PCM16k)
