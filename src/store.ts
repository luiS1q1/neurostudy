import Dexie, { Table } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { NEW_STATE, SM2State } from './lib/sm2'

export interface Subject { id?: number; name: string; type: 'facts' | 'transfer'; color: string; examDate?: string }
export interface Card { id?: number; subjectId?: number; topic?: string; front: string; back: string; difficulty: number; state: SM2State; createdAt: number }
export interface Gap { id?: number; subject: string; concept: string; note: string; relevance: number; uncertainty: number; createdAt: number }
export interface AuditLog { id?: number; kind: 'blurt' | 'feynman'; topic: string; createdAt: number; score: number; summary: string }
export interface SessionLog { id?: number; startedAt: number; minutes: number; mode: string; subject?: string }

class NSDB extends Dexie {
  subjects!: Table<Subject, number>
  cards!: Table<Card, number>
  gaps!: Table<Gap, number>
  audits!: Table<AuditLog, number>
  sessions!: Table<SessionLog, number>
  constructor() {
    super('neurostudy-os')
    this.version(1).stores({
      subjects: '++id, name',
      cards: '++id, subjectId, due, topic',
      gaps: '++id, createdAt, subject',
      audits: '++id, createdAt, kind',
      sessions: '++id, startedAt'
    })
  }
}
export const db = new NSDB()
export const useSubjects = () => useLiveQuery(() => db.subjects.toArray(), []) ?? []
export const useCards = () => useLiveQuery(() => db.cards.toArray(), []) ?? []
export const useGaps = () => useLiveQuery(() => db.gaps.toArray(), []) ?? []
export const useSessions = () => useLiveQuery(() => db.sessions.toArray(), []) ?? []
export const newCard = (front: string, back: string, difficulty = 3, extra: Partial<Card> = {}): Card =>
  ({ front, back, difficulty, state: { ...NEW_STATE, due: Date.now() }, createdAt: Date.now(), ...extra })

// ---- settings (localStorage) ----
export interface Settings { apiKey: string; micOnStart: boolean; lastSubject: string }
const DEFAULTS: Settings = { apiKey: '', micOnStart: false, lastSubject: '' }
let _settings: Settings = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem('ns_settings') || '{}') as Partial<Settings>) }
const listeners = new Set<() => void>()
export function getSettings(): Settings { return _settings }
export function saveSettings(patch: Partial<Settings>) {
  _settings = { ..._settings, ...patch }
  localStorage.setItem('ns_settings', JSON.stringify(_settings))
  listeners.forEach(l => l())
}
export function useSettings(): [Settings, (p: Partial<Settings>) => void] {
  const [s, setS] = useState(_settings)
  useEffect(() => { const l = () => setS(_settings); listeners.add(l); return () => { listeners.delete(l) } }, [])
  return [s, saveSettings]
}
