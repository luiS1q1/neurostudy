import { useState } from 'react'
import { Plus, Target, Trash2 } from 'lucide-react'
import { db, useGaps, useSubjects } from '../store'

export default function ParetoView() {
  const gaps = useGaps()
  const subjects = useSubjects()
  const [subject, setSubject] = useState('')
  const [concept, setConcept] = useState('')
  const [note, setNote] = useState('')
  const [relevance, setRelevance] = useState(7)
  const [uncertainty, setUncertainty] = useState(7)
  const [focusOnly, setFocusOnly] = useState(true)

  const add = async () => {
    if (!concept.trim()) return
    await db.gaps.add({ subject: subject || 'Allgemein', concept: concept.trim(), note, relevance, uncertainty, createdAt: Date.now() })
    setConcept(''); setNote('')
  }
  const focus = gaps.filter(g => g.relevance >= 6 && g.uncertainty >= 6).sort((a, b) => (b.relevance + b.uncertainty) - (a.relevance + a.uncertainty))
  const list = focusOnly ? focus : gaps

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">80/20 Pareto-Matrix</h1>
      <p className="text-sm text-zinc-500 mt-1">Prüfungsrelevanz gegen eigene Unsicherheit. Lernzeit gehört in den Quadrant oben rechts, der Rest wartet.</p>

      <div className="grid grid-cols-[1fr_280px] gap-6 mt-6">
        <div className="card-surface p-6">
          <svg viewBox="0 0 100 100" className="w-full">
            {[25, 50, 75].map(v => <line key={v} x1={v} y1={0} x2={v} y2={100} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />)}
            {[25, 50, 75].map(v => <line key={v} x1={0} y1={v} x2={100} y2={v} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />)}
            <rect x={50} y={0} width={50} height={50} fill="rgba(99,102,241,0.08)" />
            <text x={96} y={97} fontSize={3} fill="#6b7280" textAnchor="end">Relevanz →</text>
            <text x={3} y={5} fontSize={3} fill="#6b7280">Unsicherheit ↑</text>
            <text x={74} y={6} fontSize={2.6} fill="#818cf8">FOCUS-ZONE</text>
            {gaps.map(g => {
              const cx = g.relevance * 10, cy = 100 - g.uncertainty * 10
              const inFocus = g.relevance >= 6 && g.uncertainty >= 6
              return (
                <g key={g.id} opacity={focusOnly && !inFocus ? 0.25 : 1}>
                  <circle cx={cx} cy={cy} r={3} fill={inFocus ? '#6366f1' : '#52525b'} />
                  <text x={cx} y={cy - 5} fontSize={2.6} fill={inFocus ? '#a5b4fc' : '#71717a'} textAnchor="middle">{g.concept.slice(0, 22)}</text>
                </g>
              )
            })}
          </svg>
        </div>

        <div className="space-y-4">
          <div className="card-surface p-4 space-y-2">
            <div className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5"><Plus size={12} className="text-indigo-400" /> LÜCKE EINTRAGEN</div>
            <input className="field" placeholder="Konzept, z. B. Mitose-Phasen" value={concept} onChange={e => setConcept(e.target.value)} />
            <select className="field" value={subject} onChange={e => setSubject(e.target.value)}>
              <option value="">Fach wählen…</option>
              {subjects.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
            <textarea className="field h-16 resize-none text-xs" placeholder="Notiz (optional)" value={note} onChange={e => setNote(e.target.value)} />
            <div className="text-[10px] text-zinc-500 flex justify-between"><span>Relevanz: {relevance}</span><span>Unsicherheit: {uncertainty}</span></div>
            <input type="range" min={1} max={10} value={relevance} onChange={e => setRelevance(+e.target.value)} className="w-full accent-indigo-500" />
            <input type="range" min={1} max={10} value={uncertainty} onChange={e => setUncertainty(+e.target.value)} className="w-full accent-emerald-500" />
            <button className="btn-primary w-full flex items-center justify-center gap-1.5" onClick={add}><Target size={13} /> Eintragen</button>
          </div>
          <button className={`chip ${focusOnly ? '!text-indigo-300 !border-indigo-500/40' : ''}`} onClick={() => setFocusOnly(!focusOnly)}>
            Focus-Filter {focusOnly ? 'an' : 'aus'} ({focus.length}/{gaps.length})
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {list.map(g => (
          <div key={g.id} className="card-surface p-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm text-zinc-200">{g.concept}</div>
              <div className="text-xs text-zinc-500">{g.subject}{g.note ? ` · ${g.note}` : ''}</div>
            </div>
            <span className="chip">R{g.relevance}/U{g.uncertainty}</span>
            <button className="text-zinc-600 hover:text-red-300" onClick={() => g.id && db.gaps.delete(g.id)}><Trash2 size={13} /></button>
          </div>
        ))}
        {list.length === 0 && <div className="text-xs text-zinc-600">Noch keine Lücken. Der Voice-Tutor schreibt automatisch hier rein, wenn er eine merkt.</div>}
      </div>
    </div>
  )
}
