// Focus sounds, synthesized live: 40 Hz binaural beats + brown/white noise. No audio files.
export type SoundKind = 'binaural' | 'brown' | 'white' | 'off'
export class FocusAudio {
  ctx: AudioContext | null = null
  nodes: AudioNode[] = []
  kind: SoundKind = 'off'
  volume = 0.35
  private ensure() {
    if (!this.ctx) this.ctx = new AudioContext()
    if (this.ctx.state === 'suspended') this.ctx.resume()
    return this.ctx
  }
  set(kind: SoundKind, volume = this.volume) {
    this.volume = volume
    this.stop()
    if (kind === 'off') return
    const ctx = this.ensure()
    const master = ctx.createGain()
    master.gain.value = this.volume
    master.connect(ctx.destination)
    if (kind === 'binaural') {
      // carrier 200 Hz left / 240 Hz right -> 40 Hz beat in the brain
      for (const [f, pan] of [[200, -1], [240, 1]] as const) {
        const osc = ctx.createOscillator()
        const g = ctx.createGain(); const p = ctx.createStereoPanner()
        osc.frequency.value = f; g.gain.value = 0.5; p.pan.value = pan
        osc.connect(g).connect(p).connect(master); osc.start()
        this.nodes.push(osc, g, p)
      }
    } else {
      const len = ctx.sampleRate * 2
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const d = buf.getChannelData(0)
      let last = 0
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1
        if (kind === 'white') d[i] = w * 0.6
        else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 }
      }
      const src = ctx.createBufferSource()
      src.buffer = buf; src.loop = true
      src.connect(master); src.start()
      this.nodes.push(src, master)
      return
    }
    this.nodes.push(master)
  }
  stop() {
    for (const n of this.nodes) { try { (n as OscillatorNode).stop?.(); n.disconnect() } catch {} }
    this.nodes = []
    this.kind = 'off'
  }
}
export const focusAudio = new FocusAudio()
