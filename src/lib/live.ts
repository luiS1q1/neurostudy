// Gemini Live voice engine over WebSocket (JSON wire client messages; server messages
// parsed as JSON when possible, otherwise via a small hand-rolled protobuf walker).
import { getSettings } from '../store'

const MODEL = 'models/gemini-live-2.5-flash-preview'

export const SYSTEM_INSTRUCTION = `Du bist ein strenger, sokratischer Lernmentor in der App NeuroStudy OS. Du gibst NIE fertige Lösungen oder lange Erklärvorträge. Statt dessen: stelle präzise Gegenfragen, lasse den Schüler Schlussfolgerungen selbst ziehen, decke logische Fehler schonend aber direkt auf, fordere Beweise für Aussagen ("Warum stimmt das?"), und halte deine Antworten kurz (2-4 Sätze), klar und motivierend-streng. Sprich Deutsch. Wenn der Schüler etwas verstanden hat, verlange die Zusammenfassung in eigenen Worten.
Du kannst Werkzeuge aufrufen, während du sprichst: startTimer (Lernsitzung), addFlashcard (Karteikarte), triggerBlurting (Blurting-Übung), logKnowledgeGap (Schwachstelle notieren). Nutze sie proaktiv, wenn der Schüler es signalisiert oder eine Lücke sichtbar wird.`

const LIVE_TOOLS = [{
  functionDeclarations: [
    { name: 'startTimer', description: 'Startet den Session-Timer im Timer-Modul.', parameters: { type: 'object', properties: { durationMinutes: { type: 'number', description: 'Dauer in Minuten' }, mode: { type: 'string', enum: ['anti-procrastination', 'pomodoro', 'deep-work', 'custom'] } }, required: ['durationMinutes'] } },
    { name: 'addFlashcard', description: 'Erzeugt sofort eine neue Karteikarte.', parameters: { type: 'object', properties: { front: { type: 'string' }, back: { type: 'string' }, topic: { type: 'string' }, difficulty: { type: 'number' } }, required: ['front', 'back'] } },
    { name: 'triggerBlurting', description: 'Öffnet das Blurting-Studio mit einem Prompt.', parameters: { type: 'object', properties: { promptText: { type: 'string' }, timeLimitMinutes: { type: 'number' } }, required: ['promptText'] } },
    { name: 'logKnowledgeGap', description: 'Schreibt eine Schwachstelle in die 80/20-Matrix.', parameters: { type: 'object', properties: { subject: { type: 'string' }, concept: { type: 'string' }, note: { type: 'string' } }, required: ['subject', 'concept'] } }
  ]
}]

export type LiveState = 'idle' | 'connecting' | 'listening' | 'speaking'

interface LiveEvents {
  onState?: (s: LiveState) => void
  onAmplitude?: (rms: number) => void
  onText?: (t: string, final: boolean) => void
  onTool?: (name: string, args: any) => void
  onError?: (e: string) => void
}

// --- minimal protobuf walker for server frames ---
function parseFields(buf: Uint8Array): { no: number; wire: number; data: Uint8Array | bigint }[] {
  const out: any[] = []; let p = 0
  const varint = () => { let r = 0n, sh = 0n; for (;;) { const b = buf[p++]; r |= BigInt(b & 0x7f) << sh; if (!(b & 0x80)) break; sh += 7n } return r }
  while (p < buf.length) {
    const tag = Number(varint()); const no = tag >>> 3; const wire = tag & 7
    if (wire === 2) { const len = Number(varint()); out.push({ no, wire, data: buf.subarray(p, p + len) }); p += len }
    else if (wire === 0) { out.push({ no, wire, data: varint() }) }
    else if (wire === 5) { out.push({ no, wire, data: buf.subarray(p, p + 4) }); p += 4 }
    else if (wire === 1) { out.push({ no, wire, data: buf.subarray(p, p + 8) }); p += 8 }
    else break
  }
  return out
}
const text = (b: Uint8Array) => new TextDecoder().decode(b)
// google.protobuf.Struct decode (used for toolCall args)
function structValue(f: { no: number; wire: number; data: any }[]): any {
  const obj: any = {}
  for (const e of f.filter(x => x.no === 1)) {          // repeated MapField entry
    const inner = parseFields(e.data as Uint8Array)
    const key = inner.find(i => i.no === 1), val = inner.find(i => i.no === 2)
    if (key && val) obj[text(key.data as Uint8Array)] = decodeValue(parseFields(val.data as Uint8Array))
  }
  return obj
}
function decodeValue(f: { no: number; wire: number; data: any }[]): any {
  const n = f.find(x => x.no === 2), s = f.find(x => x.no === 3), b = f.find(x => x.no === 4), st = f.find(x => x.no === 5), li = f.find(x => x.no === 6)
  if (n) return Number(n.data)
  if (s) return text(s.data as Uint8Array)
  if (b) return true
  if (st) return structValue(parseFields(st.data as Uint8Array))
  if (li) { const out: any[] = []; for (const v of parseFields(li.data as Uint8Array).filter(x => x.no === 1)) out.push(decodeValue(parseFields(v.data as Uint8Array))); return out }
  return null
}

export class GeminiLive {
  private ws: WebSocket | null = null
  private ctx: AudioContext | null = null
  private worklet: AudioWorkletNode | null = null
  private micStream: MediaStream | null = null
  private queue: { src: AudioBufferSourceNode; g: GainNode }[] = []
  private outGain: GainNode | null = null
  private playing = 0
  state: LiveState = 'idle'
  muted = false
  ev: LiveEvents
  constructor(ev: LiveEvents = {}) { this.ev = ev }
  private setState(s: LiveState) { this.state = s; this.ev.onState?.(s) }

  async start() {
    if (this.state !== 'idle') return
    const key = getSettings().apiKey
    if (!key) { this.ev.onError?.('Kein API-Key. Erst unter Einstellungen hinterlegen.'); return }
    this.setState('connecting')
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    } catch { this.ev.onError?.('Mikrofon-Zugriff verweigert.'); this.setState('idle'); return }
    this.ctx = new AudioContext({ sampleRate: 48000 })
    this.outGain = this.ctx.createGain(); this.outGain.connect(this.ctx.destination)
    await this.ctx.audioWorklet.addModule('./pcm-worklet.js')
    this.worklet = new AudioWorkletNode(this.ctx, 'pcm16k')
    const src = this.ctx.createMediaStreamSource(this.micStream)
    src.connect(this.worklet) // worklet only, no loopback to speakers
    this.worklet.port.onmessage = (e) => {
      const { pcm, rms } = e.data
      this.ev.onAmplitude?.(rms)
      if (this.state === 'speaking' && rms > 0.06) this.bargeIn()
      if (this.ws && this.ws.readyState === 1 && !this.muted) {
        this.ws.send(JSON.stringify({ realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: btoa(String.fromCharCode(...new Uint8Array(pcm.buffer))) }] } }))
      }
    }
    this.openWs()
  }
  private openWs() {
    const key = getSettings().apiKey
    this.ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`)
    this.ws.onopen = () => {
      this.ws!.send(JSON.stringify({
        setup: {
          model: MODEL,
          generationConfig: { responseModalities: ['AUDIO'] },
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          tools: LIVE_TOOLS
        }
      }))
      this.setState('listening')
    }
    this.ws.onmessage = (e) => this.handle(e.data)
    this.ws.onerror = () => {
      this.ev.onError?.('WebSocket-Handshake fehlgeschlagen, prüfe Details…')
      fetch(`https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`)
        .then(async r => { const t = await r.text(); try { const j = JSON.parse(t); this.ev.onError?.(`Live-Fehler ${r.status}: ${j?.error?.message ?? t.slice(0, 200)}`) } catch { this.ev.onError?.(`Live-Fehler HTTP ${r.status}`) } })
        .catch(() => this.ev.onError?.('WebSocket zur Gemini Live API nicht erreichbar.'))
    }
    this.ws.onclose = () => { if (this.state !== 'idle') { this.ev.onError?.('Verbindung getrennt.'); this.stop() } }
  }
  private async handle(data: any) {
    if (data instanceof Blob) data = await data.text()
    if (typeof data === 'string') return this.handleJson(JSON.parse(data))
    const fields = parseFields(new Uint8Array(data))
    for (const f of fields) {
      if (f.no === 1) this.ev.onText?.('[Setup abgeschlossen]', true)
      else if (f.no === 2) this.parseServerContent(parseFields(f.data as Uint8Array))
      else if (f.no === 3) this.parseToolCall(parseFields(f.data as Uint8Array))
    }
  }
  private handleJson(msg: any) {
    if (msg.error) { this.ev.onError?.(`Gemini Live: ${msg.error.message ?? msg.error.status ?? JSON.stringify(msg.error).slice(0, 200)}`); return }
    if (msg.setupComplete) this.ev.onText?.('[Setup abgeschlossen]', true)
    if (msg.serverContent) this.parseServerContent(msg.serverContent)
    if (msg.toolCall) {
      const fc = msg.toolCall.functionCalls?.[0]
      if (fc) { this.ev.onTool?.(fc.name, typeof fc.args === 'string' ? JSON.parse(fc.args) : fc.args); this.sendToolResponse(fc.name, fc.id) }
    }
  }
  private parseServerContent(sc: any) {
    // interrupted?
    const interrupted = sc.interrupted ?? (sc.interrupted !== undefined)
    if (interrupted !== undefined && interrupted) this.clearPlayback()
    const turn = sc.modelTurn ?? sc.modelTurn?.parts
    let parts: any[] = []
    if (sc.modelTurn) parts = sc.modelTurn.parts ?? [sc.modelTurn]
    if (parts.length) {
      this.setState('speaking')
      for (const p of parts) {
        if (p.text || (p.parts?.[0]?.text)) { const t = p.text ?? p.parts[0].text; this.ev.onText?.(t, false) }
        const inline = p.inlineData ?? p.inline_data
        if (inline?.data) this.playPcm24k(inline.data)
      }
    }
    if (sc.turnComplete || sc.generationComplete) {
      this.ev.onText?.('', true)
      if (this.playing === 0) this.setState('listening')
    }
  }
  private parseToolCall(tc: any) {
    const calls = tc.functionCalls ?? []
    for (const c of calls) {
      let args: any = {}
      try {
        const f = parseFields(c.args as Uint8Array) // protobuf Struct
        args = structValue(f)
      } catch { try { args = typeof c.args === 'string' ? JSON.parse(c.args) : c.args } catch { args = {} } }
      this.ev.onTool?.(c.name, args)
      this.sendToolResponse(c.name, c.id)
    }
  }
  private sendToolResponse(name: string, id?: string) {
    const resp: any = { toolResponse: { functionResponses: [{ id, name, response: { result: 'ok' } }] } }
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(resp))
  }
  private playPcm24k(b64: string) {
    const bin = atob(b64); const n = bin.length >> 1
    const pcm = new Int16Array(n)
    for (let i = 0; i < n; i++) pcm[i] = (bin.charCodeAt(2 * i) & 0xff) | (bin.charCodeAt(2 * i + 1) << 8)
    const buf = this.ctx!.createBuffer(1, n, 24000)
    buf.getChannelData(0).set(new Float32Array(pcm).map(v => v / 32768))
    const src = this.ctx!.createBufferSource(); src.buffer = buf
    const g = this.ctx!.createGain(); src.connect(g).connect(this.outGain!)
    src.onended = () => { this.queue = this.queue.filter(q => q.src !== src); this.playing--; if (this.playing === 0 && this.state === 'speaking') this.setState('listening') }
    src.start(); this.queue.push({ src, g }); this.playing++
  }
  // Barge-in: stop audio output instantly, clear the buffer, model switches to listening
  private bargeIn() {
    this.clearPlayback()
  }
  private clearPlayback() {
    for (const q of this.queue) { try { q.src.stop() } catch {} }
    this.queue = []; this.playing = 0
    if (this.state === 'speaking') this.setState('listening')
  }
  setMuted(m: boolean) { this.muted = m }
  sendText(t: string) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: t }] }], turnComplete: true } }))
  }
  interrupt() { this.clearPlayback() }
  stop() {
    try { this.ws?.close() } catch {}
    this.clearPlayback()
    this.worklet?.disconnect(); this.ctx?.close(); this.micStream?.getTracks().forEach(t => t.stop())
    this.ws = null; this.worklet = null; this.ctx = null; this.micStream = null
    this.setState('idle')
  }
}
