import { useEffect, useState } from 'react'
import { Lightbulb, Brain, AlertTriangle } from 'lucide-react'
import { feynmanReview, FeynmanResult } from '../lib/ai'
import { db, useSettings, saveSettings } from '../store'
import { MD } from '../lib/md'

export default function FeynmanView() {
  const [settings] = useSettings()
  const [text, setText] = useState('')
  const [res, setRes] = useState<FeynmanResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const review = async () => {
    setBusy(true); setErr(''); saveSettings({ lastSubject: settings.lastSubject || 'Feynman' })
    try { setRes(await feynmanReview(text)) } catch (e: any) { setErr(e.message) }
    setBusy(false)
  }
  const logGap = async () => {
    if (!res) return
    await db.gaps.add({ subject: settings.lastSubject || 'Allgemein', concept: res.jargon[0]?.term ?? 'Feynman-Erklärung', note: res.advice, relevance: 7, uncertainty: Math.max(5, Math.round((100 - res.score) / 10)), createdAt: Date.now() })
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Feynman-Simulator & Jargon-Detektor</h1>
      <p className="text-sm text-zinc-500 mt-1">Erkläre es so einfach, dass ein Zehnjähriger es versteht. Flash Lite jagt Fachjargon, Scheinwissen und kaputte Analogien.</p>
      <div className="card-surface p-5 mt-6">
        <textarea className="field h-56 resize-none leading-relaxed" placeholder="Angenommen, ich erkläre einem Zehnjährigen: …" value={text} onChange={e => setText(e.target.value)} />
        <button className="btn-primary mt-3 flex items-center gap-2" disabled={!text.trim() || busy} onClick={review}>
          {busy ? <><Brain size={14} className="animate-pulse" /> Analysiere…</> : <><Lightbulb size={14} /> Erklärung prüfen</>}
        </button>
        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
      </div>
      {res && (
        <div className="mt-6 space-y-4">
          <div className="card-surface p-6 flex items-center gap-8">
            <div>
              <div className="font-mono text-5xl text-indigo-300">{res.score}</div>
              <div className="text-[10px] text-zinc-500 font-mono mt-1">EINFACHHEITS-SCORE</div>
            </div>
            <div className="flex-1 h-2 bg-ink-750 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-700" style={{ width: `${res.score}%` }} />
            </div>
            <button className="btn-ghost text-xs" onClick={logGap}>Lücke in 80/20-Matrix</button>
          </div>
          {res.jargon.length > 0 && (
            <div className="card-surface p-4">
              <div className="text-xs font-semibold text-zinc-400 mb-3 font-mono">JARGON-MARKIERUNGEN</div>
              <div className="flex flex-wrap gap-2">{res.jargon.map((j, i) => (
                <span key={i} className="chip !bg-amber-500/10 !border-amber-500/25 !text-amber-200" title={j.reason}>{j.term}</span>
              ))}</div>
              <div className="mt-3 space-y-1.5">{res.jargon.map((j, i) => <div key={i} className="text-xs text-zinc-500"><span className="text-amber-300 font-mono">{j.term}</span> · {j.reason}</div>)}</div>
            </div>
          )}
          {res.broken_analogies.length > 0 && (
            <div className="card-surface p-4">
              <div className="text-xs font-semibold text-zinc-400 mb-2 font-mono flex items-center gap-1.5"><AlertTriangle size={12} className="text-red-400" /> UNLOGISCHE ANALOGIEN</div>
              {res.broken_analogies.map((a, i) => (
                <div key={i} className="text-sm mt-2"><div className="text-zinc-200">„{a.analogy}"</div><div className="text-xs text-red-300/80 mt-0.5">{a.problem}</div></div>
              ))}
            </div>
          )}
          {res.pseudo_knowledge.length > 0 && (
            <div className="card-surface p-4">
              <div className="text-xs font-semibold text-zinc-400 mb-2 font-mono">SCHEINWISSEN</div>
              <ul className="text-sm text-zinc-300 space-y-1">{res.pseudo_knowledge.map((p, i) => <li key={i}>· {p}</li>)}</ul>
            </div>
          )}
          <div className="card-surface p-4"><div className="text-xs font-semibold text-zinc-400 mb-2 font-mono">NACHBESSERUNG</div><MD>{res.advice}</MD></div>
        </div>
      )}
    </div>
  )
}
