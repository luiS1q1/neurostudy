// Gemini Flash Lite layer: JSON evaluation calls + a ReAct agent loop
import { getSettings } from '../store'
import { getContextForAI } from './knowledge'

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
export const FLASH_MODEL = 'gemini-flash-lite-latest'

function key(): string {
  const k = getSettings().apiKey
  if (!k) throw new Error('Kein API-Key hinterlegt. Trage ihn unter Einstellungen ein.')
  return k
}

async function generate(body: any): Promise<any> {
  const res = await fetch(`${BASE}/${FLASH_MODEL}:generateContent?key=${key()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generationConfig: { temperature: 0.4, responseMimeType: 'application/json' }, ...body })
  })
  if (!res.ok) { const t = await res.text(); throw new Error(`Gemini ${res.status}: ${t.slice(0, 300)}`) }
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? ''
  try { return JSON.parse(text) } catch { throw new Error('KI-Antwort war kein gültiges JSON: ' + text.slice(0, 200)) }
}

export interface BlurtAudit {
  score: number
  correct: { quote: string; feedback: string }[]
  partial: { quote: string; feedback: string; what_is_missing: string }[]
  wrong: { quote: string; feedback: string; correction: string }[]
  missing: { topic: string; why_important: string }[]
}

export async function auditBlurt(topic: string, source: string, blurt: string): Promise<BlurtAudit> {
  return generate({
    systemInstruction: { parts: [{ text: `Du bist ein strenger Lern-Auditor für ${topic || 'ein Fachthema'}. Vergleiche die Freitext-Wiedergabe eines Schülers semantisch mit der Vorlage. Klassifiziere jede Kernaussage der Wiedergabe als korrekt (grün), unvollständig/ungenau (gelb) oder falsch (rot). Liste zusätzlich fehlende Kernpunkte. JSON mit: score (0-100 Genauigkeit), correct[], partial[], wrong[] (jeweils quote = wörtliches Zitat aus der Wiedergabe, feedback, und bei wrong correction), missing[] (topic, why_important). Alles auf Deutsch.` }] },
    contents: [{ role: 'user', parts: [{ text: `VORLAGE / FACHWISSEN:\n${source || '(keine Vorlage, nutze gesichertes Fachwissen)'}\n\nWIEDERGABE DES SCHÜLERS:\n${blurt}` }] }]
  })
}

export interface FeynmanResult {
  score: number
  jargon: { term: string; reason: string }[]
  broken_analogies: { analogy: string; problem: string }[]
  pseudo_knowledge: string[]
  advice: string
}

export async function feynmanReview(text: string): Promise<FeynmanResult> {
  return generate({
    systemInstruction: { parts: [{ text: 'Du bist der Feynman-Prüfer. Der Schüler erklärt ein Konzept so einfach, dass ein Zehnjähriger es versteht. Markiere unnötige Fachbegriffe (jargon, term + reason), Analogien, die in sich unlogisch sind (broken_analogies, analogy + problem), Aussagen, die Scheinwissen verraten (pseudo_knowledge), und gib einen Einfachheits-Score 1-100 (score) plus konkrete Nachbesserung (advice). Streng bewerten: Fachjargon ohne einfache Umschreibung kostet klar Punkte. JSON, Deutsch.' }] },
    contents: [{ role: 'user', parts: [{ text }] }]
  })
}

export async function generateCards(sourceText: string, topic: string, count = 8): Promise<{ front: string; back: string; difficulty: number }[]> {
  return generate({
    systemInstruction: { parts: [{ text: `Erzeuge ${count} atomare Karteikarten (genau EIN Faktenkern pro Karte, niemals Multi-Fakten-Karten) aus dem Material für ${topic || 'das Thema'}. Front = präzise Frage, Back = kurze Antwort. Markdown/LaTeX erlaubt ($...$ inline, $$...$$ block). difficulty 1-5. JSON-Array mit front, back, difficulty.` }] },
    contents: [{ role: 'user', parts: [{ text: sourceText }] }]
  })
}

// ---- ReAct agent loop (Plan -> Act -> Observe) ------------------------------
export interface AgentTool {
  name: string
  description: string
  parameters: { type: string; properties: Record<string, any>; required?: string[] }
  run: (args: any) => Promise<string>
}

export async function agentLoop(userIntent: string, tools: AgentTool[], maxSteps = 6, onStep?: (s: string) => void): Promise<string> {
  let fullIntent = userIntent
  try { fullIntent = `LERNKONTEXT DES SCHÜLERS (Ablage + Leinwand):\n${await getContextForAI(20000)}\n\nAUFGABE: ${userIntent}` } catch { /* offline ok */ }
  const contents: any[] = [{ role: 'user', parts: [{ text: fullIntent }] }]
  for (let step = 0; step < maxSteps; step++) {
    const res = await fetch(`${BASE}/${FLASH_MODEL}:generateContent?key=${key()}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: 'Du bist ein Lern-Planungsagent (ReAct). Plane zuerst (Gedanke im text-Teil), rufe dann sequenziell die nötigen Werkzeuge auf, beobachte die Ergebnisse und fahre fort, bis das Ziel erreicht ist. Antworte am Ende mit einem kurzen Abschluss-Satz auf Deutsch.' }] },
        tools: [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) }],
        contents,
        generationConfig: { temperature: 0.3 }
      })
    })
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const data = await res.json()
    const parts = data?.candidates?.[0]?.content?.parts ?? []
    const calls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall)
    const thought = parts.filter((p: any) => p.text).map((p: any) => p.text).join(' ')
    if (thought && onStep) onStep(thought)
    if (!calls.length) return thought || 'Fertig.'
    contents.push({ role: 'model', parts })
    const responses = []
    for (const c of calls) {
      const tool = tools.find(t => t.name === c.name)
      let out: string
      if (!tool) out = `Unbekanntes Werkzeug: ${c.name}`
      else { try { onStep?.(`→ ${c.name} ${JSON.stringify(c.args).slice(0, 120)}`); out = await tool.run(c.args ?? {}) } catch (e: any) { out = `Fehler: ${e.message}` } }
      responses.push({ functionResponse: { name: c.name, response: { result: out } } })
    }
    contents.push({ role: 'user', parts: responses })
  }
  return 'Maximale Schritte erreicht.'
}
