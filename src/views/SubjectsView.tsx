import { useState } from 'react'
import { Plus, BookOpen, Code2, CalendarDays, Shuffle } from 'lucide-react'
import { db, useSubjects, useCards, useSessions, Subject } from '../store'
import { MODES } from '../lib/bus'

const COLORS = ['#6366f1', '#34d399', '#f59e0b', '#f472b6', '#38bdf8', '#a78bfa', '#fb7185']

export default function SubjectsView() {
  const subjects = useSubjects()
  const cards = useCards()
  const sessions = useSessions()
  const [name, setName] = useState('')
  const [type, setType] = useState<'facts' | 'transfer'>('facts')
  const [exam, setExam] = useState('')

  const add = async () => {
    if (!name.trim()) return
    await db.subjects.add({ name: name.trim(), type, color: COLORS[subjects.length % COLORS.length], examDate: exam || undefined })
    setName(''); setExam('')
  }
  const del = async (id?: number) => { if (id) await db.subjects.delete(id) }

  // Interleaving scheduler: max 3 subjects per day, rotation favors stale + due-heavy subjects
  const lastStudied = (s: Subject) => Math.max(0, ...sessions.filter(x => x.subject === s.name).map(x => x.startedAt))
  const dueCount = (s: Subject) => cards.filter(c => c.subjectId === s.id && c.state.due <= Date.now()).length
  const plan = [...subjects]
    .map(s => ({ s, score: (Date.now() - lastStudied(s)) / 86400000 + dueCount(s) * 2 + (s.examDate ? Math.max(0, 30 - (new Date(s.examDate).getTime() - Date.now()) / 86400000) : 0) }))
    .sort((a, b) => b.score - a.score).slice(0, 3)

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Fächer-Manager</h1>
      <p className="text-sm text-zinc-500 mt-1">Faktenfächer werden abgefragt, Transferfächer durchgerechnet. Der Scheduler erlaubt maximal 3 Fächer pro Lerntag.</p>

      <div className="card-surface p-5 mt-6">
        <div className="text-xs font-semibold text-zinc-400 mb-3 flex items-center gap-1.5"><Shuffle size={12} className="text-indigo-400" /> ROTATIONSPLAN FÜR HEUTE (MAX. 3)</div>
        <div className="grid grid-cols-3 gap-3">
          {plan.length ? plan.map((p, i) => (
            <div key={p.s.id} className="bg-ink-750 rounded-lg p-3 border border-white/[0.06]">
              <div className="text-[10px] font-mono text-zinc-600">SLOT {i + 1}</div>
              <div className="text-sm font-medium mt-1 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: p.s.color }} />{p.s.name}</div>
              <div className="text-[10px] text-zinc-500 mt-1">{dueCount(p.s)} Karten fällig</div>
            </div>
          )) : <div className="text-xs text-zinc-600 col-span-3">Noch keine Fächer angelegt.</div>}
        </div>
      </div>

      <div className="card-surface p-5 mt-4 space-y-3">
        <div className="flex gap-2">
          <input className="field flex-1" placeholder="Neues Fach, z. B. Biologie" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
          <select className="field w-52" value={type} onChange={e => setType(e.target.value as any)}>
            <option value="facts">Fakten-/Abfragefach</option>
            <option value="transfer">Transferfach</option>
          </select>
          <input className="field w-40" type="date" value={exam} onChange={e => setExam(e.target.value)} />
          <button className="btn-primary flex items-center gap-1.5" onClick={add}><Plus size={14} /> Anlegen</button>
        </div>
        <div className="text-[10px] text-zinc-600 flex items-center gap-2">
          <span className="chip"><BookOpen size={10} /> Fakten: Vokabeln, Definitionen, Geschichte → Abfrage-Karten</span>
          <span className="chip"><Code2 size={10} /> Transfer: Mathe, Physik, Programmierung → Übung + Feynman</span>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {subjects.map(s => {
          const sc = cards.filter(c => c.subjectId === s.id)
          return (
            <div key={s.id} className="card-surface p-4 flex items-center gap-4">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
              <div className="flex-1">
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-zinc-500 flex items-center gap-2 mt-0.5">
                  {s.type === 'facts' ? <><BookOpen size={11} /> Faktenfach</> : <><Code2 size={11} /> Transferfach</>}
                  <span className="text-zinc-700">·</span>{sc.length} Karten
                  {s.examDate && <><span className="text-zinc-700">·</span><CalendarDays size={11} /> {new Date(s.examDate).toLocaleDateString('de-DE')}</>}
                </div>
              </div>
              <button className="btn-ghost !py-1 text-xs text-red-300/80" onClick={() => del(s.id)}>Löschen</button>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-zinc-600 mt-4">Sessions aus dem Timer ({sessions.length} bisher) zählen in die Rotation: lange nicht gelernte Fächer rutschen nach oben.</p>
    </div>
  )
}
