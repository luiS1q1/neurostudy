import { useState } from 'react'
import { KeyRound, CheckCircle2, XCircle, Database } from 'lucide-react'
import { useSettings, saveSettings, db, useCards, useGaps } from '../store'

export default function SettingsView() {
  const [settings, set] = useSettings()
  const [key, setKey] = useState(settings.apiKey)
  const [test, setTest] = useState<'ok' | 'fail' | null>(null)
  const cards = useCards(); const gaps = useGaps()

  const verify = async () => {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`)
      setTest(r.ok ? 'ok' : 'fail')
      if (r.ok) saveSettings({ apiKey: key })
    } catch { setTest('fail') }
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
      <div className="card-surface p-6 mt-6">
        <div className="text-sm font-medium flex items-center gap-2"><KeyRound size={14} className="text-indigo-400" /> Google AI API-Key</div>
        <p className="text-xs text-zinc-500 mt-1">Wird nur lokal in deinem Browser gespeichert (localStorage) und für Live-Voice und die Audits genutzt. Kostenlos über <a className="text-indigo-400 underline" href="https://aistudio.google.com/apikey" target="_blank">Google AI Studio</a>.</p>
        <div className="flex gap-2 mt-3">
          <input className="field flex-1 font-mono text-xs" type="password" placeholder="AIza…" value={key} onChange={e => { setKey(e.target.value); setTest(null) }} />
          <button className="btn-primary" onClick={verify} disabled={!key}>Speichern + Testen</button>
        </div>
        {test === 'ok' && <div className="text-xs text-emerald-400 mt-2 flex items-center gap-1"><CheckCircle2 size={12} /> Key gültig und gespeichert</div>}
        {test === 'fail' && <div className="text-xs text-red-400 mt-2 flex items-center gap-1"><XCircle size={12} /> Key ungültig oder Netzwerkfehler</div>}
      </div>

      <div className="card-surface p-6 mt-4">
        <div className="text-sm font-medium flex items-center gap-2"><Database size={14} className="text-indigo-400" /> Lokale Daten (IndexedDB)</div>
        <div className="text-xs text-zinc-500 mt-1">Fächer, Karten, Lücken und Sessions liegen komplett offline in deinem Browser.</div>
        <div className="flex gap-3 mt-3 text-xs">
          <span className="chip">{cards.length} Karten</span>
          <span className="chip">{gaps.length} Lücken</span>
          <span className="chip">{subjects0()}</span>
        </div>
        <button className="btn-ghost mt-4 text-xs text-red-300/80" onClick={async () => { if (confirm('Wirklich ALLE lokalen Daten löschen?')) { await Promise.all([db.cards.clear(), db.gaps.clear(), db.subjects.clear(), db.sessions.clear(), db.audits.clear()]) } }}>Alle Daten löschen</button>
      </div>
    </div>
  )
}
function subjects0() { return 'Fächer & Sessions: siehe Module' }
