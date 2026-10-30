import { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Volume2, VolumeX, Eye } from 'lucide-react'
import { timerEngine, MODES, TimerState, fmt } from '../lib/bus'
import { focusAudio, SoundKind } from '../lib/synth'
import { db, useSessions } from '../store'

export default function TimerView() {
  const [t, setT] = useState<TimerState>(timerEngine.state)
  const [sound, setSound] = useState<SoundKind>('off')
  const [target, setTarget] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const growth = useRef(1)
  const sessions = useSessions()
  useEffect(() => timerEngine.subscribe(() => setT({ ...timerEngine.state })), [])
  useEffect(() => () => focusAudio.stop(), [])

  // Flow crystal: grows while the tab is visible, resets when the user leaves
  useEffect(() => {
    const iv = setInterval(() => { if (!document.hidden && t.running) growth.current = Math.min(2.2, growth.current + 0.002) }, 100)
    const vis = () => { if (document.hidden) growth.current = 1 }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', vis) }
  }, [t.running])

  useEffect(() => {
    let raf = 0
    const draw = () => {
      const c = canvasRef.current
      if (c) {
        const ctx = c.getContext('2d')!
        ctx.clearRect(0, 0, c.width, c.height)
        const cx = c.width / 2, cy = c.height / 2
        const time = performance.now() / 1000
        const s = (18 + (t.running ? growth.current : 1) * 14 + Math.sin(time * 2) * 2)
        const sides = 6
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(time * 0.15 * (t.running ? 1 : 0.2))
        const g = ctx.createLinearGradient(-s, -s, s, s)
        g.addColorStop(0, t.phase === 'break' ? '#34d399' : '#818cf8'); g.addColorStop(1, '#1e1b4b')
        ctx.beginPath()
        for (let i = 0; i < sides; i++) {
          const a = (i / sides) * Math.PI * 2
          const px = Math.cos(a) * s, py = Math.sin(a) * s
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
        }
        ctx.closePath(); ctx.fillStyle = g; ctx.globalAlpha = 0.85; ctx.fill()
        ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke()
        ctx.beginPath()
        for (let i = 0; i < sides; i++) {
          const a = (i / sides) * Math.PI * 2 + Math.PI / 6
          const px = Math.cos(a) * s * 0.55, py = Math.sin(a) * s * 0.55
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
        }
        ctx.closePath(); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.stroke()
        ctx.restore()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [t.running, t.phase])

  const start = (id: string) => { focusAudio.stop(); setSound('off'); timerEngine.start(id, undefined, target) }
  const done = sessions.reduce((a, s) => a + s.minutes, 0)

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Kognitiver Multi-Modus-Timer</h1>
      <p className="text-sm text-zinc-500 mt-1">Vier Fokus-Modi, synthetisierte Sounds (keine MP3s) und ein Flow-Wächter, der schrumpft, sobald du den Tab verlässt.</p>

      <div className="card-surface p-8 mt-6 flex items-center gap-10">
        <canvas ref={canvasRef} width={160} height={160} />
        <div className="flex-1">
          <div className={`font-mono text-6xl tracking-tight ${t.phase === 'break' ? 'text-emerald-400' : 'text-zinc-100'}`}>
            {t.phase === 'idle' ? '--:--' : fmt(t.secondsLeft)}
          </div>
          <div className="text-sm text-zinc-500 mt-2">{t.phase === 'idle' ? 'Bereit' : `${t.phase === 'break' ? 'Pause' : 'Fokusphase'} · ${t.mode.label} · Zyklus ${t.cyclesDone + 1}`}</div>
          {t.target && <div className="text-xs text-zinc-600 mt-1">Ziel: {t.target}</div>}
          <div className="flex gap-2 mt-5">
            <button className="btn-primary flex items-center gap-2" onClick={() => timerEngine.toggle()}>
              {t.running ? <><Pause size={14} /> Pause</> : <><Play size={14} /> {t.phase === 'idle' ? 'Starten' : 'Weiter'}</>}
            </button>
            <button className="btn-ghost flex items-center gap-2" onClick={() => timerEngine.reset()}><RotateCcw size={14} /> Reset</button>
            <button className="btn-ghost flex items-center gap-2" onClick={() => { const k = sound === 'off' ? 'binaural' : 'off'; setSound(k); focusAudio.set(k) }}>
              {sound === 'off' ? <><VolumeX size={14} /> Ton aus</> : <><Volume2 size={14} /> {sound}</>}
            </button>
          </div>
          {sound !== 'off' && (
            <div className="flex gap-2 mt-3">
              {(['binaural', 'brown', 'white'] as SoundKind[]).map(k => (
                <button key={k} onClick={() => { setSound(k); focusAudio.set(k) }} className={`chip ${sound === k ? '!text-indigo-300 !border-indigo-500/40' : ''}`}>{k === 'binaural' ? '40 Hz Binaural' : k === 'brown' ? 'Brown Noise' : 'White Noise'}</button>
              ))}
            </div>
          )}
        </div>
        <div className="text-right text-xs text-zinc-500 border-l border-white/[0.06] pl-8">
          <div className="font-mono text-2xl text-zinc-200">{done}</div>
          <div>Fokus-Minuten<br />gesamt</div>
          <div className="mt-3 flex items-center justify-end gap-1 text-zinc-600"><Eye size={11} /> Flow-Wächter</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-6">
        {MODES.map(m => (
          <button key={m.id} onClick={() => start(m.id)} className={`card-surface p-4 text-left hover:border-indigo-500/40 transition-colors ${t.phase !== 'idle' && t.mode.id === m.id ? 'border-indigo-500/50' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{m.label}</span>
              <span className="chip">{m.work} / {m.brk}</span>
            </div>
            <div className="text-xs text-zinc-500 mt-1.5 leading-relaxed">{m.desc}</div>
          </button>
        ))}
      </div>
      <div className="card-surface p-4 mt-3">
        <div className="text-xs text-zinc-500 mb-2">Ziel für die Custom Challenge (optional, gilt für den nächsten Start)</div>
        <input className="field" placeholder="z. B. Bio: Stationen Influenza/Grippe durcharbeiten" value={target} onChange={e => setTarget(e.target.value)} />
      </div>
      <p className="text-xs text-zinc-600 mt-4">Sessions werden geloggt und füttern den Interleaving-Scheduler in den Fächern.</p>
    </div>
  )
}
