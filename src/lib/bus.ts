// Global app state: session timer engine + voice singleton wiring helpers
export interface TimerMode { id: string; label: string; work: number; brk: number; desc: string }
export const MODES: TimerMode[] = [
  { id: 'anti-procrastination', label: 'Anti-Prokrastination', work: 15, brk: 3, desc: '15 Min Sprint / 3 Min Pause. Parkinson-Fokus: kurze Deadline, kein Aufschieben.' },
  { id: 'pomodoro', label: 'Pomodoro Pro', work: 25, brk: 5, desc: '25 Min / 5 Min. Der Klassiker für stabile Arbeitssessions.' },
  { id: 'deep-work', label: 'Ultradian Deep Work', work: 90, brk: 15, desc: '90 Min / 15 Min. Angelehnt an neurobiologische Leistungszyklen (ultradiane Rhythmik).' },
  { id: 'custom', label: 'Custom Challenge', work: 30, brk: 5, desc: 'Frei wählbar mit Zielangabe.' }
]

type Sub = () => void
export interface TimerState { mode: TimerMode; phase: 'work' | 'break' | 'idle'; secondsLeft: number; running: boolean; target: string; cyclesDone: number }
class TimerEngine {
  state: TimerState = { mode: MODES[0], phase: 'idle', secondsLeft: 0, running: false, target: '', cyclesDone: 0 }
  private subs = new Set<Sub>()
  private iv: number | null = null
  subscribe(f: Sub) { this.subs.add(f); return () => { this.subs.delete(f) } }
  private emit() { this.subs.forEach(f => f()) }
  start(modeId: string, minutes?: number, target = '') {
    const mode = MODES.find(m => m.id === modeId) ?? MODES[0]
    this.state = { mode, phase: 'work', secondsLeft: (minutes ?? mode.work) * 60, running: true, target, cyclesDone: this.state.cyclesDone }
    this.tickOn()
  }
  toggle() {
    if (this.state.phase === 'idle') { this.start(this.state.mode.id); return }
    this.state.running = !this.state.running
    this.tickOn()
  }
  reset() { this.state = { ...this.state, phase: 'idle', secondsLeft: 0, running: false }; this.tickOn() }
  private tickOn() {
    if (this.iv) { clearInterval(this.iv); this.iv = null }
    if (this.state.running) {
      this.iv = setInterval(() => {
        if (this.state.secondsLeft > 0) this.state.secondsLeft -= 1
        else {
          this.state.phase = this.state.phase === 'work' ? 'break' : 'work'
          if (this.state.phase === 'work') this.state.cyclesDone += 1
          this.state.secondsLeft = (this.state.phase === 'work' ? this.state.mode.work : this.state.mode.brk) * 60
          window.dispatchEvent(new CustomEvent('ns-phase', { detail: this.state.phase }))
        }
        this.emit()
      }, 1000)
    }
    this.emit()
  }
}
export const timerEngine = new TimerEngine()
export function fmt(s: number) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
