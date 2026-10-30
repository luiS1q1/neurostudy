import { useEffect, useState } from 'react'
import { Zap, Play, Check, Plus, Brain } from 'lucide-react'
import { auditBlurt, BlurtAudit, generateCards } from '../lib/ai'
import { db, newCard, useSubjects, useSettings } from '../store'
import { timerEngine } from '../lib/bus'
import { MD } from '../lib/md'

export default function BlurtingView() {
  const subjects = useSubjects()
  const [settings] = useSettings()
  const [phase, setPhase] = useState<'setup' | 'write' | 'audit'>('setup')
  const [topic, setTopic] = useState('')
  const [subject, setSubject] = useState('')
  const [minutes, setMinutes] = useState(7)
  const [source, setSource] = useState('')
  const [blurt, setBlurt] = useState('')
  const [left, setLeft] = useState(0)
  const [audit, setAudit] = useState<BlurtAudit | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [genBusy, setGenBusy] = useState<string>('')

  useEffect(() => {
    const h = (e: any) => { setTopic(e.detail.promptText ?? ''); if (e.detail.timeLimitMinutes) setMinutes(e.detail.timeLimitMinutes); setPhase('setup') }
    window.addEventListener('ns-open-blurting', h)
    return () => window.removeEventListener('ns-open-blurting', h)
  }, [])

  const begin = () => {
    setBlurt(''); setLeft(minutes * 60); setPhase('write'); setAudit(null)
    timerEngine.start('custom', minutes, `Blurting: ${topic || subject}`)
  }
  useEffect(() => {
    if (phase !== 'write') return
    const iv = setInterval(() => setLeft(l => (l > 0 ? l - 1 : 0)), 1000)
    return () => clearInterval(iv)
  }, [phase])

  const runAudit = async () => {
    timerEngine.reset()
    setPhase('audit'); setBusy(true); setErr('')
    try { setAudit(await auditBlurt(topic || subject, source, blurt)) }
    catch (e: any) { setErr(e.message); setPhase('write') }
    setBusy(false)
  }
  const addFromGap = async (text: string) => {
    setGenBusy(text)
    try {
      const cards = await generateCards(`Erzeuge Karten genau zu diesem Defizit: ${text}. Kontext-Thema: ${topic || subject}.`, topic || subject, 3)
      await db.cards.bulkAdd(cards.map(c => newCard(c.front, c.back, c.difficulty, { topic: topic || subject })))
      setGenBusy('')
    } catch (e: any) { setGenBusy(''); alert('Karten-Generierung fehlgeschlagen: ' + e.message) }
  }

  if (phase === 'write') return (
    <div className="h-full flex flex-col p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Blurt it out</h1>
          <div className="text-xs text-zinc-500">Schreib ALLES runter, woran du dich erinnerst. Kein Nachschauen. <span className="font-mono text-indigo-300">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span></div>
        </div>
        <button className="btn-primary" onClick={runAudit}>Fertig, prüfen</button>
      </div>
      <textarea autoFocus className="field flex-1 !bg-ink-900 resize-none font-mono text-sm leading-relaxed" placeholder={`Wissen zu "${topic || subject}"…`} value={blurt} onChange={e => setBlurt(e.target.value)} />
    </div>
  )

  if (phase === 'audit') return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Diff-Dashboard</h1>
      {busy && <div className="text-sm text-zinc-500 mt-4 flex items-center gap-2"><Brain size={14} className="animate-pulse text-indigo-400" /> Gemini Flash Lite prüft deine Wiedergabe semantisch…</div>}
      {err && <div className="text-sm text-red-400 mt-4">{err}</div>}
      {audit && (
        <div className="mt-6 space-y-4">
          <div className="card-surface p-5 flex items-center gap-6">
            <div className="font-mono text-4xl text-indigo-300">{audit.score}</div>
            <div className="text-xs text-zinc-500">Recall-Score<br />aus dem semantischen Audit</div>
            <div className="ml-auto flex gap-3 text-xs">
              <span className="chip !text-emerald-300 !border-emerald-500/30">{audit.correct.length} korrekt</span>
              <span className="chip !text-amber-300 !border-amber-500/30">{audit.partial.length} unvollständig</span>
              <span className="chip !text-red-300 !border-red-500/30">{audit.wrong.length} falsch</span>
              <span className="chip">{audit.missing.length} fehlen</span>
            </div>
          </div>
          {([['Grün: präzise erinnert', audit.correct, 'emerald'], ['Gelb: unvollständig / ungenau', audit.partial, 'amber'], ['Rot: gravierende Lücken / Denkfehler', audit.wrong, 'red']] as const).map(([title, items, col]) => (
            <div key={title}>
              <div className="text-xs font-semibold text-zinc-400 mb-2">{title}</div>
              <div className="space-y-2">
                {(items as any[]).map((it, i) => (
                  <div key={i} className={`card-surface p-3 text-sm border-l-2 ${col === 'emerald' ? 'border-l-emerald-500' : col === 'amber' ? 'border-l-amber-500' : 'border-l-red-500'}`}>
                    <div className="text-zinc-200">„{it.quote}"</div>
                    <div className="text-xs text-zinc-500 mt-1">{it.feedback}{it.correction ? ` → ${it.correction}` : ''}{it.what_is_missing ? ` → fehlt: ${it.what_is_missing}` : ''}</div>
                    {col !== 'emerald' && (
                      <button className="btn-ghost mt-2 !py-1 text-xs flex items-center gap-1.5" disabled={genBusy === it.quote} onClick={() => addFromGap(it.correction ?? it.what_is_missing ?? it.quote)}>
                        <Plus size={11} /> {genBusy === it.quote ? 'generiere Karten…' : 'Auto-Flashcards aus dieser Lücke'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {audit.missing.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-zinc-400 mb-2">Fehlende Kernpunkte</div>
              <div className="space-y-2">{audit.missing.map((m, i) => (
                <div key={i} className="card-surface p-3 text-sm border-l-2 border-l-red-500 flex items-center justify-between">
                  <div><div className="text-zinc-200">{m.topic}</div><div className="text-xs text-zinc-500 mt-0.5">{m.why_important}</div></div>
                  <button className="btn-ghost !py-1 text-xs flex items-center gap-1.5" onClick={() => addFromGap(m.topic)}><Plus size={11} /> Karten</button>
                </div>
              ))}</div>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button className="btn-ghost" onClick={() => { setPhase('setup'); setAudit(null) }}>Neues Blurting</button>
            <button className="btn-ghost" onClick={runAudit}>Erneut prüfen (Überarbeitung)</button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Blurting & Active-Recall Studio</h1>
      <p className="text-sm text-zinc-500 mt-1">Alles aus dem Kopf rausschreiben, dann prüft Flash Lite jede Aussage semantisch gegen deine Vorlage: grün, gelb, rot.</p>
      <div className="card-surface p-6 mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-zinc-500">Thema</label><input className="field mt-1" placeholder="z. B. Mitose" value={topic} onChange={e => setTopic(e.target.value)} /></div>
          <div><label className="text-xs text-zinc-500">Fach (optional)</label>
            <select className="field mt-1" value={subject} onChange={e => setSubject(e.target.value)}>
              <option value="">–</option>
              {subjects.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div><label className="text-xs text-zinc-500">Timer</label>
          <div className="flex gap-2 mt-1">{[5, 7, 10, 15].map(m => <button key={m} onClick={() => setMinutes(m)} className={`chip ${minutes === m ? '!text-indigo-300 !border-indigo-500/40' : ''}`}>{m} Min</button>)}</div>
        </div>
        <div><label className="text-xs text-zinc-500">Vorlage / Fachwissen zum Vergleich (optional, sonst nutzt die KI ihr Fachwissen)</label>
          <textarea className="field mt-1 h-32 resize-none text-xs font-mono" placeholder="Folie, Zusammenfassung, Buchabschnitt einfügen…" value={source} onChange={e => setSource(e.target.value)} />
        </div>
        <button className="btn-primary flex items-center gap-2" disabled={!topic && !subject} onClick={begin}><Play size={14} /> Blurting starten</button>
      </div>
      <p className="text-xs text-zinc-600 mt-4">Letztes Thema: <span className="font-mono">{settings.lastSubject || '–'}</span>. Der Ablauf: schreiben ohne Hilfsmittel, dann Diff-Dashboard, dann Karten aus den roten Lücken.</p>
    </div>
  )
}
