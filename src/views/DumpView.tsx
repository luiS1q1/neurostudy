import { useRef, useState } from 'react'
import { StickyNote, FileUp, Trash2, Library } from 'lucide-react'
import { db, useDocs } from '../store'

export default function DumpView() {
  const docs = useDocs()
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const save = async () => {
    if (!text.trim()) return
    await db.docs.add({ title: title.trim() || `Ablage ${new Date().toLocaleDateString('de-DE')} ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`, content: text, createdAt: Date.now(), size: text.length })
    setText(''); setTitle(''); setNote('Gespeichert. Der Voice-Tutor und alle KI-Module nutzen das ab jetzt als Kontext.')
  }
  const upload = async (files: FileList | null) => {
    if (!files) return
    for (const f of Array.from(files)) {
      try {
        const t = await f.text()
        await db.docs.add({ title: f.name, content: t, createdAt: Date.now(), size: t.length })
      } catch { setNote(`${f.name}: konnte nicht als Text gelesen werden (nur .txt/.md/.csv).`) }
    }
    setNote('Datei(en) übernommen.')
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Library size={20} className="text-indigo-400" /> Wissen</h1>
      <p className="text-xs text-zinc-500 mt-1">Alles rein, was du lernen musst: Text reinpasten oder Dateien hochladen. Der Voice-Tutor und die KI-Module haben das immer als Kontext und können gezielt durchsuchen.</p>

      <div className="card-surface p-6 mt-6">
        <div className="text-sm font-medium flex items-center gap-2"><StickyNote size={14} className="text-indigo-400" /> Text ablegen</div>
        <input className="field mt-3 text-sm" placeholder="Titel (optional), z.B. Bio – Zellatmung" value={title} onChange={e => setTitle(e.target.value)} />
        <textarea className="field mt-2 font-mono text-xs leading-relaxed" rows={8} placeholder="Hier einfügen: Arbeitsblatt, Aufschriebe, Buchtext …" value={text} onChange={e => setText(e.target.value)} />
        <div className="flex items-center gap-2 mt-3">
          <button className="btn-primary" onClick={save} disabled={!text.trim()}>Ablegen</button>
          <button className="btn-ghost flex items-center gap-1.5" onClick={() => fileRef.current?.click()}><FileUp size={13} /> Dateien (.txt, .md, .csv)</button>
          <input ref={fileRef} type="file" accept=".txt,.md,.csv,.markdown" multiple className="hidden" onChange={e => { upload(e.target.files); e.currentTarget.value = '' }} />
          <span className="text-xs text-zinc-500">{text.length.toLocaleString('de-DE')} Zeichen</span>
        </div>
        {note && <div className="text-xs text-emerald-400 mt-2">{note}</div>}
      </div>

      <div className="card-surface p-6 mt-4">
        <div className="text-sm font-medium">Ablage ({docs.length})</div>
        {docs.length === 0 && <div className="text-xs text-zinc-600 mt-2">Noch leer. Alles, was hier liegt, bekommt der Tutor automatisch in den Kontext.</div>}
        <div className="mt-3 space-y-2">
          {docs.map(d => (
            <div key={d.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-ink-900 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-200 truncate">{d.title}</div>
                <div className="text-[10px] text-zinc-600 font-mono">{d.size.toLocaleString('de-DE')} Zeichen · {new Date(d.createdAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <button className="btn-ghost !px-2 !py-1 text-red-300/80" onClick={() => db.docs.delete(d.id!)}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
