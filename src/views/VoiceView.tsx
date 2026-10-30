import { useEffect, useState } from 'react'
import { Mic, Shield, Zap, Square, Wrench } from 'lucide-react'
import { orbRef } from '../components/Orb'
import { useSettings } from '../store'
import { MD } from '../lib/md'

export default function VoiceView() {
  const [settings] = useSettings()
  const [state, setState] = useState(orbRef.current?.state ?? 'idle')
  const [text, setText] = useState<string[]>([])
  useEffect(() => {
    const iv = setInterval(() => setState(orbRef.current?.state ?? 'idle'), 500)
    const h = (e: any) => setText((t: string[]) => [...t.slice(-40), e.detail])
    window.addEventListener('ns-voice-text', h)
    return () => { clearInterval(iv); window.removeEventListener('ns-voice-text', h) }
  }, [])
  const live = orbRef.current
  const on = state !== 'idle'
  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Live Voice Socratic Tutor</h1>
      <p className="text-sm text-zinc-500 mt-1">Gemini Live über WebSocket, 16 kHz PCM ein, 24 kHz raus, Barge-in in Echtzeit. Streng, sokratisch, keine fertigen Lösungen.</p>

      <div className="card-surface p-6 mt-6 flex items-center gap-6">
        <div className={`w-16 h-16 rounded-full ${on ? 'bg-emerald-500/20 border border-emerald-500/40 animate-pulse' : 'bg-ink-750 border border-white/10'} flex items-center justify-center`}>
          <Mic size={24} className={on ? 'text-emerald-300' : 'text-zinc-500'} />
        </div>
        <div className="flex-1">
          <div className="text-lg font-medium">{on ? (state === 'speaking' ? 'Der Mentor spricht' : state === 'listening' ? 'Er hört zu' : 'Verbinde…') : 'Tutor inaktiv'}</div>
          <div className="text-xs text-zinc-500 mt-1">Der schwebende Orb unten rechts startet und stoppt die Session. <span className="kbd">M</span> schaltet das Mikro stumm.</div>
        </div>
        <button className={on ? 'btn-ghost flex items-center gap-2' : 'btn-primary flex items-center gap-2'} onClick={() => { const l = orbRef.current!; on ? l.stop() : l.start() }}>
          {on ? <><Square size={13} /> Stoppen</> : <><Zap size={13} /> Session starten</>}
        </button>
      </div>

      {!settings.apiKey && (
        <div className="card-surface p-4 mt-4 border border-amber-500/20 bg-amber-500/5">
          <div className="text-sm text-amber-300">Noch kein Google AI API-Key hinterlegt.</div>
          <div className="text-xs text-zinc-400 mt-1">Ohne Key läuft der Timer offline, aber Stimme und KI-Audits brauchen einen Key aus <a className="text-indigo-400 underline" href="https://aistudio.google.com/apikey">Google AI Studio</a>. Trage ihn unter <button className="underline" onClick={() => window.dispatchEvent(new CustomEvent('ns-goto', { detail: 'settings' }))}>Einstellungen</button> ein.</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mt-6">
        {[
          { icon: Shield, t: 'Sokratisches Rollenprofil', d: 'Gegenfragen statt Antworten. Erkennt logische Fehlschlüsse und zwingt dich, sie zu schließen.' },
          { icon: Zap, t: 'Barge-in', d: 'Du beginnst zu sprechen, die KI stoppt sofort und hört zu. Keine Warteschleife.' },
          { icon: Wrench, t: 'Live Function Calling', d: 'startTimer, addFlashcard, triggerBlurting, logKnowledgeGap mitten im Gespräch.' },
          { icon: Mic, t: 'Echtzeit-Audio', d: 'AudioWorklet, 16 kHz Linear PCM hoch, 24 kHz runter, ohne Dateien, komplett im Browser.' }
        ].map(f => (
          <div key={f.t} className="card-surface p-4">
            <f.icon size={16} className="text-indigo-400" />
            <div className="text-sm font-medium mt-2">{f.t}</div>
            <div className="text-xs text-zinc-500 mt-1 leading-relaxed">{f.d}</div>
          </div>
        ))}
      </div>

      {text.length > 0 && (
        <div className="card-surface p-4 mt-6">
          <div className="text-xs font-semibold text-zinc-400 mb-2 font-mono">SESSION-TRANSKRIPT</div>
          <div className="space-y-2 text-sm text-zinc-300 max-h-64 overflow-y-auto"><MD>{text.join('\n\n')}</MD></div>
        </div>
      )}
    </div>
  )
}
