// SM-2 (SuperMemo 2) algorithm
export interface SM2State { ease: number; interval: number; reps: number; lapses: number; due: number }
export const NEW_STATE: SM2State = { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: 0 }
// quality: 0 = Again, 3 = Hard, 4 = Good, 5 = Easy
export function sm2(state: SM2State, quality: number): SM2State {
  let { ease, interval, reps, lapses } = state
  if (quality < 3) { reps = 0; lapses += 1; interval = 1 }
  else {
    reps += 1
    if (reps === 1) interval = quality === 5 ? 3 : 1
    else if (reps === 2) interval = quality === 5 ? 7 : 6
    else interval = Math.round(interval * ease * (quality === 3 ? 0.85 : 1))
    if (quality === 3) interval = Math.max(1, Math.round(interval * 1.2))
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
  const due = Date.now() + interval * 86400000
  return { ease, interval, reps, lapses, due }
}
