// Gemini Live voice engine over WebSocket (JSON wire client messages; server messages
// parsed as JSON when possible, otherwise via a small hand-rolled protobuf walker).
import { getSettings, db } from '../store'
import { handleAiTool, buildLiveContext } from './knowledge'

const MODEL = 'models/gemini-live-2.5-flash-preview'

export const SYSTEM_INSTRUCTION = `Du bist ein strenger, sokratischer Lernmentor in der App NeuroStudy OS. Du gibst NIE fertige Lösungen oder lange Erklärvorträge. Statt dessen: stelle präzise Gegenfragen, lasse den Schüler Schlussfolgerungen selbst ziehen, decke logische Fehler schonend aber direkt auf, fordere Beweise für Aussagen ("Warum stimmt das?"), und halte deine Antworten kurz (2-4 Sätze), klar und motivierend-streng. Sprich Deutsch. Wenn der Schüler etwas verstanden hat, verlange die Zusammenfassung in eigenen Worten.
Du kannst Werkzeuge aufrufen, während du sprichst: startTimer (Lernsitzung), addFlashcard (Karteikarte), triggerBlurting (Blurting-Übung), logKnowledgeGap (Schwachstelle notieren). Nutze sie proaktiv, wenn der Schüler es signalisiert oder eine Lücke sichtbar wird.
Du hast eine geteilte Leinwand (Space), die der Schüler live sieht: Lege dort Karten mit addCanvasCard. AUFGABENSTELLUNGEN legst du IMMER als Karte ab (kind: text), Quizfragen als kind: quiz mit options und answer (0-basierter Index der richtigen Option), Konzepte und Diagramme als kind: diagram mit einfachem, beschriftetem SVG-Markup, Kerndefinitionen als kind: flashcard. Sortiere die Leinwand mit arrangeCanvas, wenn sie unordentlich wirkt. Schlage bei Fachfragen zuerst mit searchDump im Lernmaterial des Schülers nach statt aus dem Gedächtnis zu antworten.
Du kennst die Lernmethoden der App und wählst passend: Faktenwissen -> atomare addFlashcard-Karten oder quiz-Karten auf der Leinwand; Verständnis -> Feynman-Simulator (startFeynman) oder Blurting (triggerBlurting); Fokus -> startTimer; Schwächen -> logKnowledgeGap. addFlashcard: GENAU EIN Fakt pro Karte, front ist eine konkrete Frage (kein Ja/Nein), back die knappe Antwort, topic = Fach und Stichwort. Beginne die Arbeit sofort und erzähle niemals "hab etwas Geduld" oder kündige Arbeit an, ohne sie sofort zu machen. Bei addCanvasCard mit diagram: kompakte SVGs (höchstens ~60 Zeilen), damit die Antwort nicht Minuten braucht.`

const LIVE_TOOLS = [{
  functionDeclarations: [
    { name: 'startTimer', description: 'Startet den Session-Timer im Timer-Modul.', parameters: { type: 'object', properties: { durationMinutes: { type: 'number', description: 'Dauer in Minuten' }, mode: { type: 'string', enum: ['anti-procrastination', 'pomodoro', 'deep-work', 'custom'] } }, required: ['durationMinutes'] } },
    { name: 'addFlashcard', description: 'Erzeugt GENAU EINE atomare Karteikarte für den SM-2-Stapel: front = konkrete Frage zu EINEM Fakt (kein Ja/Nein, max. 20 Wörter), back = knappe Antwort (max. 30 Wörter), topic = Fach und Stichwort (z.B. "Bio - Zellatmung"). Keine Sammelkarten ("Alles über X"); für Quiz nutze addCanvasCard mit kind quiz.', parameters: { type: 'object', properties: { front: { type: 'string' }, back: { type: 'string' }, topic: { type: 'string' }, difficulty: { type: 'number', description: '1-5, wie schwer die Karte für den Schüler ist' } }, required: ['front', 'back', 'topic'] } },
    { name: 'triggerBlurting', description: 'Öffnet das Blurting-Studio mit einem Prompt.', parameters: { type: 'object', properties: { promptText: { type: 'string' }, timeLimitMinutes: { type: 'number' } }, required: ['promptText'] } },
    { name: 'logKnowledgeGap', description: 'Schreibt eine Schwachstelle in die 80/20-Matrix.', parameters: { type: 'object', properties: { subject: { type: 'string' }, concept: { type: 'string' }, note: { type: 'string' } }, required: ['subject', 'concept'] } },
    { name: 'addCanvasCard', description: 'Legt eine Karte auf die geteilte Leinwand (Space), die der Schüler sofort sieht. Für Aufgabenstellungen (text), Quiz (quiz), Diagramme (diagram mit svg), Definitionen (flashcard).', parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['text', 'quiz', 'diagram', 'flashcard'] }, title: { type: 'string' }, content: { type: 'string' }, options: { type: 'array', items: { type: 'string' }, description: 'nur bei quiz' }, answer: { type: 'number', description: 'nur bei quiz: Index der richtigen Option, 0-basiert' }, svg: { type: 'string', description: 'nur bei diagram: vollständiges SVG-Markup, deutsch beschriftet' }, back: { type: 'string', description: 'nur bei flashcard: Rückseite (Lösung/Definition)' } }, required: ['kind', 'title', 'content'] } },
    { name: 'arrangeCanvas', description: 'Ordnet die Karten auf der Leinwand neu.', parameters: { type: 'object', properties: { layout: { type: 'string', enum: ['grid', 'byKind', 'custom'] }, positions: { type: 'array', items: { type: 'object', properties: { cardId: { type: 'number' }, title: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } } } } }, required: ['layout'] } },
    { name: 'searchDump', description: 'Durchsucht das Lernmaterial des Schülers (Ablage + Leinwand) nach relevanten Stellen.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
    { name: 'startFeynman', description: 'Öffnet den Feynman-Simulator, damit der Schüler das Thema in eigenen Worten einfach erklärt.', parameters: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'] } }
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
  // newest first; used when the key's model list can't be fetched
  static CANDIDATES = ['models/gemini-3.8-live', 'models/gemini-3.8-live-extended-thinking', 'models/gemini-3.1-flash-live-preview', 'models/gemini-live-2.5-flash-preview', 'models/gemini-2.0-flash-live-001']
  // preference when picking from the key's actual model list (3.8 Live first)
  static PREFERENCE = ['gemini-3.8-live', 'gemini-3.1-flash-live', 'gemini-live-2.5-flash-preview', 'gemini-2.5-flash-native-audio', 'gemini-2.0-flash-live']
  private modelIdx = 0
  private setupDone = false
  private sessionId = Date.now()
  thinkHold = false
  private holdBuf: string[] = []
  private lastModelSignal = 0
  private awaitingTool = false
  private kicks = 0
  private watchdog: any = null
  private rejected = new Set<string>()
  private nextStart = 0
  private userStopped = false
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
  // Werkzeug-Hänger: antwortet das Modell nach einem Tool-Aufruf 15 s lang nicht, stoßen wir es an (max. 2x)
  private checkHang() {
    if (this.state === 'idle' || !this.ws || this.ws.readyState !== 1) return
    if (this.awaitingTool && this.kicks < 2 && Date.now() - this.lastModelSignal > 15000) {
      this.kicks++
      this.awaitingTool = false
      this.ev.onText?.('[Der Tutor hat nach einem Werkzeugaufruf geschwiegen - ich stoße ihn an]', false)
      this.sendText('Führe deine Aufgabe fort.')
      this.lastModelSignal = Date.now()
    }
  }
  // Denk-Pause loslassen: der Worklet reicht den Puffer ab jetzt geordnet nach
  releaseHold() {
    this.thinkHold = false
  }
  private sendAudio(b64: string) {
    if (this.ws && this.ws.readyState === 1 && this.setupDone && !this.muted) {
      try { this.ws.send(JSON.stringify({ realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: b64 } } })) } catch { /* drop */ }
    }
  }
  // persistent conversation log: every session lands in IndexedDB and feeds the next ones
  private log(role: 'user' | 'model' | 'tool', text: string) {
    try { db.voiceLog.add({ sessionId: this.sessionId, role, text: String(text).slice(0, 2000), at: Date.now() }) } catch { /* offline ok */ }
  }

  async start() {
    if (this.state !== 'idle') return
    const key = getSettings().apiKey
    if (!key) { this.ev.onError?.('Kein API-Key. Erst unter Einstellungen hinterlegen.'); return }
    this.userStopped = false
    this.modelIdx = 0
    this.sessionId = Date.now()
    this.thinkHold = false
    this.holdBuf = []
    this.kicks = 0
    this.awaitingTool = false
    this.lastModelSignal = Date.now()
    if (this.watchdog) clearInterval(this.watchdog)
    this.watchdog = setInterval(() => this.checkHang(), 5000)
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
      const b64 = btoa(String.fromCharCode(...new Uint8Array(pcm.buffer)))
      if (this.thinkHold) { // Denk-Pause: Audio puffern, nach dem Loslassen ordentlich nachreichen
        this.holdBuf.push(b64)
        if (this.holdBuf.length > 2400) this.holdBuf.shift()
        return
      }
      if (this.state === 'speaking' && rms > 0.06) this.bargeIn()
      if (this.holdBuf.length) {
        // Nachlass: gepuffertes Audio zügig in Reihenfolge nachschieben, nie als Schwall (der Server verschluckt sonst den Anfang)
        this.holdBuf.push(b64)
        const burst = Math.min(3, Math.max(1, Math.ceil(this.holdBuf.length / 120)))
        for (let i = 0; i < burst; i++) {
          const d = this.holdBuf.shift()
          if (d) this.sendAudio(d)
        }
        return
      }
      this.sendAudio(b64)
    }
    this.openWs()
  }
  // pick the best Live model the key actually has: 3.8 live first, then down the line
  private async pickModel(key: string): Promise<string | null> {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1000`)
      const j = await r.json()
      if (!j.error) {
        const live: string[] = (j.models ?? []).map((m: any) => m.name)
          .filter((n: string) => /live|native-audio/i.test(n) && !this.rejected.has(n))
        for (const pat of GeminiLive.PREFERENCE) {
          const hit = live.find(n => n.toLowerCase().includes(pat))
          if (hit) return hit
        }
        if (live.length) return live[0]
        return null
      }
    } catch { /* list unavailable -> static chain */ }
    while (this.modelIdx < GeminiLive.CANDIDATES.length && this.rejected.has(GeminiLive.CANDIDATES[this.modelIdx])) this.modelIdx++
    if (this.modelIdx >= GeminiLive.CANDIDATES.length) return null
    return GeminiLive.CANDIDATES[this.modelIdx++]
  }
  private async openWs() {
    const key = getSettings().apiKey
    const chosen = getSettings().liveModel
    // explicit pick from Settings wins; on rejection the auto chain takes over
    const model = chosen ? (chosen.startsWith('models/') ? chosen : 'models/' + chosen) : await this.pickModel(key)
    if (!model) {
      this.ev.onError?.('Kein nutzbares Live-Modell für diesen Key gefunden.')
      this.probeModels(key)
      this.stop()
      return
    }
    const ctx = await buildLiveContext()
    this.ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`)
    this.ws.onopen = () => {
      this.setupDone = false
      this.ws!.send(JSON.stringify({
        setup: {
          model,
          generationConfig: model.includes('extended-thinking')
            ? { responseModalities: ['AUDIO'], thinkingConfig: { thinkingLevel: (getSettings().thinkingLevel || 'low') as any } }
            : { responseModalities: ['AUDIO'] },
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }, { text: ctx }] },
          tools: LIVE_TOOLS,
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      }))
      this.ev.onText?.(`[Live-Modell: ${model.replace('models/', '')}]`, true)
      this.setState('listening')
    }
    this.ws.onmessage = (e) => this.handle(e.data)
    this.ws.onerror = () => {
      this.ev.onError?.('WebSocket-Handshake fehlgeschlagen, prüfe Details…')
      fetch(`https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`)
        .then(async r => { const t = await r.text(); try { const j = JSON.parse(t); this.ev.onError?.(`Live-Fehler ${r.status}: ${j?.error?.message ?? t.slice(0, 200)}`) } catch { this.ev.onError?.(`Live-Fehler HTTP ${r.status}`) } })
        .catch(() => this.ev.onError?.('WebSocket zur Gemini Live API nicht erreichbar.'))
    }
    this.ws.onclose = (e) => {
      if (this.userStopped) return
      const detail = e.reason ? ` (${e.reason})` : ` (Code ${e.code})`
      this.rejected.add(model)
      this.ev.onError?.(`${model.replace('models/', '')} abgelehnt${detail}, probiere nächstes Live-Modell…`)
      this.openWs()
    }
  }
  // list which Live models the key actually has access to, and show it
  private async probeModels(key: string) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1000`)
      const j = await r.json()
      if (j.error) { this.ev.onError?.(`Model-Liste: ${j.error.message ?? 'Fehler'}`); return }
      const live = (j.models ?? []).filter((m: any) => (m.name ?? '').toLowerCase().includes('live') || (m.supportedGenerationMethods ?? []).includes('bidiGenerateContent')).map((m: any) => m.name)
      if (live.length) this.ev.onError?.(`Live-Modelle deines Keys: ${live.join(', ')}`)
      else this.ev.onError?.('Dein Key listet keine Live-Modelle: Live API evtl. für diesen Key nicht verfügbar.')
    } catch { /* ignore */ }
  }
  private async handle(data: any) {
    if (data instanceof Blob) data = await data.text()
    if (typeof data === 'string') return this.handleJson(JSON.parse(data))
    const fields = parseFields(new Uint8Array(data))
    this.lastModelSignal = Date.now()
    for (const f of fields) {
      if (f.no === 1) { this.setupDone = true; this.ev.onText?.('[Setup abgeschlossen]', true) }
      else if (f.no === 2) this.parseServerContent(parseFields(f.data as Uint8Array))
      else if (f.no === 3) this.parseToolCall(parseFields(f.data as Uint8Array))
    }
  }
  private handleJson(msg: any) {
    this.lastModelSignal = Date.now()
    if (msg.error) { this.ev.onError?.(`Gemini Live: ${msg.error.message ?? msg.error.status ?? JSON.stringify(msg.error).slice(0, 200)}`); return }
    if (msg.setupComplete) { this.setupDone = true; this.ev.onText?.('[Setup abgeschlossen]', true) }
    // extended-thinking models: turnComplete no longer means idle, only IDLE does
    if (msg.interactionStatus === 'IDLE' && this.playing === 0 && this.state !== 'idle') this.setState('listening')
    if (msg.serverContent) this.parseServerContent(msg.serverContent)
    if (msg.toolCall) this.parseToolCall(msg.toolCall)
    const known = ['serverContent', 'toolCall', 'setupComplete', 'interactionStatus', 'usageMetadata', 'goAway']
    if (!known.some(k => k in msg)) this.ev.onText?.(`[Server: ${Object.keys(msg).join(',')}]`, true)
  }
  private parseServerContent(sc: any) {
    const uText = sc.inputTranscription?.text
    if (uText) { this.log('user', uText); this.ev.onText?.(`Du: ${uText}`, false) }
    const hasModelText = (sc.modelTurn?.parts ?? []).some((p: any) => p.text)
    const oText = sc.outputTranscription?.text
    if (hasModelText || oText) this.awaitingTool = false
    if (oText && !hasModelText) { this.log('model', oText); this.ev.onText?.(oText, false) }
    // interrupted?
    const interrupted = sc.interrupted ?? (sc.interrupted !== undefined)
    if (interrupted !== undefined && interrupted) this.clearPlayback()
    const turn = sc.modelTurn ?? sc.modelTurn?.parts
    let parts: any[] = []
    if (sc.modelTurn) parts = sc.modelTurn.parts ?? [sc.modelTurn]
    if (parts.length) {
      this.setState('speaking')
      for (const p of parts) {
        if (p.text || (p.parts?.[0]?.text)) { const t = p.text ?? p.parts[0].text; this.log('model', t); this.ev.onText?.(t, false) }
        const inline = p.inlineData ?? p.inline_data
        if (inline?.data) this.playPcm24k(inline.data)
      }
    }
    if (sc.turnComplete || sc.generationComplete) {
      this.ev.onText?.('', true)
      if (this.playing === 0) this.setState('listening')
    }
  }
  private async parseToolCall(tc: any) {
    const calls = tc.functionCalls ?? []
    for (const c of calls) {
      let args: any = {}
      try {
        if (c.args instanceof Uint8Array) args = structValue(parseFields(c.args))
        else args = typeof c.args === 'string' ? JSON.parse(c.args) : c.args
      } catch { args = {} }
      if (typeof args !== 'object' || args === null) args = {}
      this.log('tool', `${c.name} ${JSON.stringify(args).slice(0, 200)}`)
      this.ev.onTool?.(c.name, args)
      if (['addCanvasCard', 'arrangeCanvas', 'clearCanvas', 'searchDump'].includes(c.name)) {
        let res: string
        try { res = await handleAiTool(c.name, args) } catch (e: any) { res = 'Fehler: ' + e.message }
        this.sendToolResponse(c.name, c.id, { result: res })
      } else {
        this.sendToolResponse(c.name, c.id)
      }
    }
  }
  private sendToolResponse(name: string, id?: string, response?: any) {
    const resp: any = { toolResponse: { functionResponses: [{ id, name, response: response ?? { result: 'ok' } }] } }
    if (this.ws?.readyState === 1) { this.ws.send(JSON.stringify(resp)); this.awaitingTool = true; this.lastModelSignal = Date.now() }
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
    // play chunks strictly back to back, never on top of each other
    const t0 = Math.max(this.ctx!.currentTime + 0.05, this.nextStart)
    src.start(t0); this.nextStart = t0 + buf.duration
    this.queue.push({ src, g }); this.playing++
  }
  // Barge-in: stop audio output instantly, clear the buffer, model switches to listening
  private bargeIn() {
    this.clearPlayback()
  }
  private clearPlayback() {
    for (const q of this.queue) { try { q.src.stop() } catch {} }
    this.queue = []; this.playing = 0; this.nextStart = 0
    if (this.state === 'speaking') this.setState('listening')
  }
  setMuted(m: boolean) {
    const was = this.muted; this.muted = m
    if (m !== was && this.ws?.readyState === 1) {
      // automatic activity detection expects the stream to be opened/closed explicitly
      this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: m } }))
    }
  }
  sendText(t: string) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: t }] }], turnComplete: true } }))
  }
  interrupt() { this.clearPlayback() }
  stop() {
    this.userStopped = true
    try { this.ws?.close() } catch {}
    this.clearPlayback()
    this.worklet?.disconnect(); this.ctx?.close(); this.micStream?.getTracks().forEach(t => t.stop())
    this.ws = null; this.worklet = null; this.ctx = null; this.micStream = null
    this.setState('idle')
    if (this.watchdog) { clearInterval(this.watchdog); this.watchdog = null }
  }
}
