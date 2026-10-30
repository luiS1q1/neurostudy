import { useEffect, useState } from 'react'
import { Layers, Sparkles, Check, X, ThumbsUp, Flame, Plus } from 'lucide-react'
import { db, newCard, useCards, useSubjects, Card } from '../store'
import { sm2 } from '../lib/sm2'
import { generateCards } from '../lib/ai'
import { MD } from '../lib/md'

export default function CardsView() {
  const cards = useCards()
  const subjects = useSubjects()
  const [mode, setMode] = useState<'review' | 'manage' | 'gen'>('review')
  const [current, setCurrent] = useState<Card | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [genText, setGenText] = useState('')
  const [genBusy, setGenBusy] = useState(false)
  const [preview, setPreview] = useState<{ front: string; back: string; difficulty: number }[]>([])
  const [genTopic, setGenTopic] = useState('')

  const due = cards.filter(c => c.state.due <= Date.now()).sort((a, b) => a.state.due - b.state.due)

  useEffect(() => {
    if (mode === 'review' && !current && due.length) { setCurrent(due[0]); setRevealed(false) }
    if (mode !== 'review' && current) { setCurrent(null); setRevealed(false) }
  }, [mode, due.length])

  const rate = async (q: number) => {
    if (!current?.id) return
    await db.cards.update(current.id, { state: sm2(current.state, q) })
    const next = due.filter(c => c.id !== current.id)[0] ?? null
    setCurrent(next); setRevealed(false)
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (mode !== 'review' || !current || !revealed) return
      const map: Record<string, number> = { '1': 0, '2': 3, '3': 4, '4': 5 }
      if (map[e.key] !== undefined) { e.preventDefault(); rate(map[e.key]) }
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); setRevealed(true) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [mode, current, revealed])

  const runGen = async () => {
    setGenBusy(true)
    try { setPreview(await generateCards(genText, genTopic)) } catch (e: any) { alert(e.message) }
    setGenBusy(false)
  }
  const saveAll = async () => {
    await db.cards.bulkAdd(preview.map(c => newCard(c.front, c.back, c.difficulty, { topic: genTopic })))
    setPreview([]); setGenText(''); setMode('review')
  }

  const RATING = [
    { q: 0, label: 'Nochmal', key: '1', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
    { q: 3, label: 'Schwer', key: '2', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    { q: 4, label: 'Gut', key: '3', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    { q: 5, label: 'Einfach', key: '4', cls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' }
  ]

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Spaced Repetition (SM-2)</h1>
        <div className="flex gap-2">
          {(['review', 'manage', 'gen'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} className={`chip ${mode === m ? '!text-indigo-300 !border-indigo-500/40' : ''}`}>
              {m === 'review' ? `Fällig (${due.length})` : m === 'manage' ? 'Verwalten' : 'KI-Generator'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'review' && (
        <div className="mt-6">
          {current ? (
            <div className="card-surface p-8">
              <div className="text-xs text-zinc-500 font-mono mb-4">{current.topic || 'Karte'} · Intervall {Math.max(0, Math.ceil((current.state.due - Date.now()) / 86400000))} Tage · Ease {current.state.ease.toFixed(2)}</div>
              <div className="text-lg text-zinc-100"><MD>{current.front}</MD></div>
              {revealed ? (
                <>
                  <div className="h-px bg-white/[0.06] my-5" />
                  <div className="text-base text-zinc-300"><MD>{current.back}</MD></div>
                  <div className="grid grid-cols-4 gap-2 mt-6">
                    {RATING.map(r => (
                      <button key={r.key} onClick={() => rate(r.q)} className={`btn ${r.cls} border font-medium flex items-center justify-center gap-1.5`}>
                        {r.q === 0 ? <X size={12} /> : r.q === 5 ? <Sparkles size={12} /> : r.q === 4 ? <ThumbsUp size={12} /> : <Flame size={12} />} {r.label} <span className="kbd">{r.key}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <button className="btn-primary mt-6" onClick={() => setRevealed(true)}>Aufdecken <span className="kbd ml-1">Enter</span></button>
              )}
            </div>
          ) : (
            <div className="card-surface p-10 text-center text-sm text-zinc-500">
              {due.length === 0 ? 'Alles für heute wiederholt. Nächste Karten siehe Verwalten.' : ''}
            </div>
          )}
          <p className="text-xs text-zinc-600 mt-3"><span className="kbd">1</span> Nochmal · <span className="kbd">2</span> Schwer · <span className="kbd">3</span> Gut · <span className="kbd">4</span> Einfach</p>
        </div>
      )}

      {mode === 'gen' && (
        <div className="mt-6 space-y-4">
          <div className="card-surface p-5">
            <div className="text-xs text-zinc-500 mb-2">Vorlesungsfolien, Textabschnitt oder Notizen einfügen. Die KI baut atomare Karten (ein Faktenkern pro Karte, LaTeX/markdown-fähig).</div>
            <textarea className="field h-40 resize-none text-sm font-mono" placeholder="Material einfügen…" value={genText} onChange={e => setGenText(e.target.value)} />
            <div className="flex gap-2 mt-3">
              <input className="field flex-1" placeholder="Thema (optional)" value={genTopic} onChange={e => setGenTopic(e.target.value)} />
              <button className="btn-primary flex items-center gap-2" disabled={!genText.trim() || genBusy} onClick={runGen}><Sparkles size={13} /> {genBusy ? 'Generiere…' : 'Karten generieren'}</button>
            </div>
          </div>
          {preview.length > 0 && (
            <div className="space-y-2">
              {preview.map((c, i) => (
                <div key={i} className="card-surface p-3 text-sm"><div className="text-zinc-200"><MD>{c.front}</MD></div><div className="text-xs text-zinc-500 mt-1"><MD>{c.back}</MD></div></div>
              ))}
              <div className="flex gap-2">
                <button className="btn-primary flex items-center gap-2" onClick={saveAll}><Check size={13} /> Alle {preview.length} speichern</button>
                <button className="btn-ghost" onClick={() => setPreview([])}>Verwerfen</button>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'manage' && (
        <div className="mt-6 space-y-2">
          <AddCard subjects={subjects} />
          {cards.map(c => (
            <div key={c.id} className="card-surface p-3 flex items-center gap-3 text-sm">
              <div className="flex-1"><MD>{c.front}</MD></div>
              <div className="text-xs text-zinc-500 font-mono shrink-0">{c.state.interval > 0 ? `${c.state.interval}d` : 'neu'} · {c.state.due <= Date.now() ? 'fällig' : new Date(c.state.due).toLocaleDateString('de-DE')}</div>
              <button className="text-zinc-600 hover:text-red-300 text-xs" onClick={() => c.id && db.cards.delete(c.id)}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AddCard({ subjects }: { subjects: { id?: number; name: string }[] }) {
  const [front, setFront] = useState(''); const [back, setBack] = useState(''); const [topic, setTopic] = useState('')
  return (
    <div className="card-surface p-4 flex gap-2 items-start">
      <div className="flex-1 space-y-2">
        <input className="field" placeholder="Vorderseite (Frage, LaTeX erlaubt: $E=mc^2$)" value={front} onChange={e => setFront(e.target.value)} />
        <input className="field" placeholder="Rückseite (Antwort)" value={back} onChange={e => setBack(e.target.value)} />
      </div>
      <input className="field w-40" placeholder="Thema" value={topic} onChange={e => setTopic(e.target.value)} />
      <button className="btn-primary flex items-center gap-1.5" disabled={!front || !back} onClick={async () => {
        const subj = subjects.find(s => s.name.toLowerCase() === topic.toLowerCase())
        await db.cards.add(newCard(front, back, 3, { topic, subjectId: subj?.id })); setFront(''); setBack('')
      }}><Plus size={14} /> Karte</button>
    </div>
  )
}
