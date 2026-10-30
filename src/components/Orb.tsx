import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Square, X, Loader2, Sparkles } from 'lucide-react'
import { GeminiLive, LiveState } from '../lib/live'

export interface OrbHandle { live: GeminiLive | null }
export const orbRef: { current: GeminiLive | null } = { current: null }
export let notifyTool: ((name: string, args: any) => void) | null = null

export function Orb() {
  const [state, setState] = useState<LiveState>('idle')
  const [amp, setAmp] = useState(0)
  const [muted, setMuted] = useState(false)
  const [open, setOpen] = useState(false)
  const [transcript, setTranscript] = useState<string[]>([])
  const [toast, setToast] = useState<string>('')
  const [hold, setHold] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ampRef = useRef(0)

  useEffect(() => {
    const live = new GeminiLive({
      onState: s => { setState(s); if (s === 'idle') setTranscript([]) },
      onAmplitude: a => { ampRef.current = a; setAmp(a) },
      onText: (t, final) => { if (t) { setTranscript(ts => [...ts.slice(-30), t].slice(-30)); window.dispatchEvent(new CustomEvent('ns-voice-text', { detail: t })) } },
      onTool: (name, args) => {
        const labels: Record<string, string> = { startFeynman: `Feynman-Simulator geöffnet: ${String(args.topic ?? '').slice(0, 40)}`, addCanvasCard: `Karte auf der Leinwand: ${String(args.title ?? '').slice(0, 40)}`, arrangeCanvas: 'Leinwand neu sortiert', searchDump: 'Lernmaterial durchsucht', clearCanvas: 'Leinwand geleert', startTimer: `Timer gestartet: ${args.durationMinutes ?? '?'} Min`, addFlashcard: `Karte angelegt: ${String(args.front ?? '').slice(0, 40)}…`, triggerBlurting: 'Blurting-Studio geöffnet', logKnowledgeGap: `Lücke notiert: ${args.concept ?? ''}` }
        setToast(labels[name] ?? name); setTimeout(() => setToast(''), 3500)
        window.dispatchEvent(new CustomEvent('ns-live-tool', { detail: { name, args } }))
      },
      onError: e => { setToast(e); setTimeout(() => setToast(''), 5000) }
    })
    const hh = (e: any) => setHold(!!e.detail)
    window.addEventListener('ns-think-hold', hh)
    ;(live as any)._hh = hh
    orbRef.current = live
    return () => { window.removeEventListener('ns-think-hold', (live as any)._hh ?? (() => {})); live.stop(); orbRef.current = null }
  }, [])

  useEffect(() => {
    let raf = 0
    const draw = () => {
      const c = canvasRef.current
      if (c) {
        const ctx = c.getContext('2d')!
        const w = c.width, h = c.height
        ctx.clearRect(0, 0, w, h)
        const t = performance.now() / 1000
        const base = state === 'idle' ? 0.4 : state === 'connecting' ? 0.55 : state === 'speaking' ? 0.75 : 0.6
        const wob = state === 'idle' ? Math.sin(t * 1.2) * 0.06 : ampRef.current * 3
        const r = Math.min(w, h) / 2 - 4 + wob * 12
        const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.2, w / 2, h / 2, r)
        const col = state === 'speaking' ? ['129,140,248', '79,70,229'] : state === 'listening' ? ['110,231,183', '16,185,129'] : ['148,163,184', '71,85,105']
        g.addColorStop(0, `rgba(${col[0]},0.95)`); g.addColorStop(1, `rgba(${col[1]},0.12)`)
        ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
        ctx.lineWidth = 1.5; ctx.strokeStyle = `rgba(${col[0]},${0.5 + Math.min(0.5, ampRef.current * 4)})`
        ctx.beginPath(); ctx.arc(w / 2, h / 2, r + 5 + wob * 8, 0, Math.PI * 2); ctx.stroke()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [state])

  const toggle = () => { const l = orbRef.current; if (!l) return; state === 'idle' ? l.start() : l.stop() }
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {toast && <div className="card-surface px-3 py-2 text-xs text-zinc-200 shadow-xl max-w-xs">{toast}</div>}
      {hold && <div className="card-surface px-3 py-2 text-xs text-amber-300 shadow-xl">Denk-Pause: der Tutor hört in der Zeit nichts</div>}
      {open && (
        <div className="card-surface w-80 p-3 shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5"><Sparkles size={12} className="text-indigo-400" /> Socratic Tutor</span>
            <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-300"><X size={14} /></button>
          </div>
          <div className="h-32 overflow-y-auto space-y-1 text-xs text-zinc-400 font-mono leading-snug border border-white/5 rounded-lg p-2 bg-ink-900">
            {transcript.length ? transcript.map((t, i) => <div key={i}>{t}</div>) : <span className="text-zinc-600">Sage etwas, sobald der Orb aktiv ist…</span>}
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => { setMuted(!muted); orbRef.current?.setMuted(!muted) }} className="btn-ghost flex-1 flex items-center justify-center gap-1.5">
              {muted ? <><MicOff size={13} /> Muted</> : <><Mic size={13} /> Mic (M)</>}
            </button>
            <button onClick={() => orbRef.current?.interrupt()} className="btn-ghost flex-1">Stop-Audio</button>
          </div>
          <p className="text-[10px] text-zinc-600 mt-2">Barge-in aktiv: Sprache unterbricht die KI sofort.</p>
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="relative cursor-pointer group" onClick={toggle} title={state === 'idle' ? 'Tutor starten' : 'Tutor stoppen'}>
          <canvas ref={canvasRef} width={64} height={64} className="drop-shadow-2xl" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            {state === 'idle' ? <Mic size={16} className="text-white" /> : state === 'connecting' ? <Loader2 size={16} className="text-white animate-spin" /> : <Square size={12} className="text-white" />}
          </div>
        </div>
        <button onClick={() => setOpen(!open)} className="btn-ghost !px-2 !py-1 text-xs">{open ? '×' : 'Chat'}</button>
      </div>
    </div>
  )
}
