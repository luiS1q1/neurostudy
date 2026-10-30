import { useEffect, useState } from 'react'
import { Mic, Zap, Lightbulb, Timer as TimerIcon, FolderKanban, Layers, Grid2x2, Settings as SettingsIcon } from 'lucide-react'
import { Orb, orbRef } from './Orb'
import { timerEngine, TimerState, MODES } from '../lib/bus'
import { useGaps, db, newCard } from '../store'
import TimerView from '../views/TimerView'
import BlurtingView from '../views/BlurtingView'
import FeynmanView from '../views/FeynmanView'
import SubjectsView from '../views/SubjectsView'
import CardsView from '../views/CardsView'
import ParetoView from '../views/ParetoView'
import SettingsView from '../views/SettingsView'
import VoiceView from '../views/VoiceView'

const NAV = [
  { id: 'voice', label: 'Socratic Tutor', icon: Mic },
  { id: 'blurting', label: 'Blurting Studio', icon: Zap },
  { id: 'feynman', label: 'Feynman', icon: Lightbulb },
  { id: 'timer', label: 'Focus Timer', icon: TimerIcon },
  { id: 'subjects', label: 'Fächer', icon: FolderKanban },
  { id: 'cards', label: 'Flashcards', icon: Layers },
  { id: 'pareto', label: '80/20 Matrix', icon: Grid2x2 },
  { id: 'settings', label: 'Einstellungen', icon: SettingsIcon }
] as const

export default function App() {
  const [page, setPage] = useState<string>('voice')
  const [timer, setTimer] = useState<TimerState>(timerEngine.state)
  const gaps = useGaps()
  useEffect(() => timerEngine.subscribe(() => setTimer({ ...timerEngine.state })), [])
  useEffect(() => {
    const h = (e: any) => setPage(e.detail)
    window.addEventListener('ns-goto', h)
    return () => window.removeEventListener('ns-goto', h)
  }, [])

  // live-voice tool calls -> app actions
  useEffect(() => {
    const h = async (e: any) => {
      const { name, args } = e.detail
      if (name === 'startTimer') timerEngine.start(args.mode ?? 'pomodoro', args.durationMinutes)
      else if (name === 'addFlashcard') await db.cards.add(newCard(args.front, args.back, args.difficulty ?? 3, { topic: args.topic }))
      else if (name === 'triggerBlurting') { window.dispatchEvent(new CustomEvent('ns-open-blurting', { detail: args })); setPage('blurting') }
      else if (name === 'logKnowledgeGap') await db.gaps.add({ subject: args.subject ?? 'Allgemein', concept: args.concept, note: args.note ?? '', relevance: 7, uncertainty: 7, createdAt: Date.now() })
    }
    window.addEventListener('ns-live-tool', h)
    return () => window.removeEventListener('ns-live-tool', h)
  }, [])

  // global shortcuts: Space = timer toggle, M = mic mute. 1-4 handled in CardsView while reviewing.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA|SELECT/)
      if (typing) return
      if (e.code === 'Space') { e.preventDefault(); timerEngine.toggle() }
      if (e.key.toLowerCase() === 'm') { const l = orbRef.current; if (l && l.state !== 'idle') { const m = !l.muted; l.setMuted(m) } }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <div className="h-full flex">
      <aside className="w-56 shrink-0 border-r border-white/[0.06] bg-ink-900 flex flex-col">
        <div className="px-4 py-5 border-b border-white/[0.06]">
          <div className="font-semibold tracking-tight">NeuroStudy <span className="text-indigo-400">OS</span></div>
          <div className="text-[10px] text-zinc-600 font-mono mt-0.5">Lern- und Denk-Assistent</div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {NAV.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors duration-150 ${page === n.id ? 'bg-ink-750 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-ink-850'}`}>
              <n.icon size={15} className={page === n.id ? 'text-indigo-400' : ''} /> {n.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-white/[0.06] text-xs space-y-1.5">
          {timer.phase !== 'idle' ? (
            <div className="card-surface p-2.5 cursor-pointer" onClick={() => setPage('timer')}>
              <div className="font-mono text-lg text-zinc-100">{String(Math.floor(timer.secondsLeft / 60)).padStart(2, '0')}:{String(timer.secondsLeft % 60).padStart(2, '0')}</div>
              <div className="text-[10px] text-zinc-500">{timer.phase === 'work' ? 'Fokus' : 'Pause'} · {timer.mode.label} · <span className="kbd">Leertaste</span></div>
            </div>
          ) : (
            <div className="text-zinc-600">{gaps.length} Lücken in der 80/20-Matrix</div>
          )}
          <div className="text-[10px] text-zinc-700 font-mono">Space · Timer / M · Mic</div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        {page === 'voice' && <VoiceView />}
        {page === 'blurting' && <BlurtingView />}
        {page === 'feynman' && <FeynmanView />}
        {page === 'timer' && <TimerView />}
        {page === 'subjects' && <SubjectsView />}
        {page === 'cards' && <CardsView />}
        {page === 'pareto' && <ParetoView />}
        {page === 'settings' && <SettingsView />}
      </main>
      <Orb />
    </div>
  )
}
