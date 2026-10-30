// Shared knowledge layer: dump documents + Space canvas, context + tools for voice and text AI
import { db, CanvasCard } from '../store'

const CLAMP = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)

export async function getContextForAI(maxChars = 30000): Promise<string> {
  const [docs, cards] = await Promise.all([db.docs.toArray(), db.canvasCards.toArray()])
  let out = ''
  if (cards.length) {
    out += 'LEINWAND (Space) – aktuelle Karten:\n' + cards.map(c => {
      const opts = c.data?.options?.length ? ` | Optionen: ${c.data.options.join(' / ')} (richtig: ${c.data.options[c.data.answer ?? 0] ?? '?'})` : ''
      return `- [${c.kind}] ${c.title}: ${CLAMP(String(c.content), 240)}${opts}`
    }).join('\n') + '\n\n'
  }
  const allTitles = docs.map(d => d.title).join(', ')
  for (const d of docs) {
    if (out.length >= maxChars) { out += `(Weitere Dokumente vorhanden: ${allTitles})`; break }
    out += `DOKUMENT "${d.title}":\n${d.content.slice(0, Math.max(0, maxChars - out.length - 30))}\n\n`
  }
  return out || '(Noch kein Lernmaterial abgelegt.)'
}

export async function buildLiveContext(): Promise<string> {
  const ctx = await getContextForAI(45000)
  return `Das ist das Lernmaterial des Schülers (Ablage + Leinwand). Lehre strikt darauf auf, erfinde nichts dazu. Wenn du etwas visuell veranschaulichen willst, eine Aufgabenstellung gibst oder quizzen willst: lege eine Karte auf die Leinwand (addCanvasCard), der Schüler sieht sie sofort.\n\n${ctx}`
}

export async function searchDump(query: string): Promise<string> {
  const [docs, cards] = await Promise.all([db.docs.toArray(), db.canvasCards.toArray()])
  const tokens = query.toLowerCase().split(/[^a-zäöüß0-9]+/).filter(t => t.length > 2)
  const hits: { src: string; text: string; score: number }[] = []
  for (const d of docs) {
    for (const p of d.content.split(/\n\s*\n/)) {
      if (p.trim().length < 20) continue
      const lp = p.toLowerCase()
      const score = tokens.reduce((s, t) => s + (lp.includes(t) ? 1 : 0), 0)
      if (score > 0) hits.push({ src: d.title, text: CLAMP(p.replace(/\s+/g, ' ').trim(), 450), score })
    }
  }
  for (const c of cards) {
    const lp = `${c.title} ${c.content}`.toLowerCase()
    const score = tokens.reduce((s, t) => s + (lp.includes(t) ? 1 : 0), 0)
    if (score > 0) hits.push({ src: `Leinwand-Karte "${c.title}"`, text: CLAMP(c.content, 450), score })
  }
  hits.sort((a, b) => b.score - a.score)
  const top = hits.slice(0, 6).map(h => `[${h.src}] ${h.text}`).join('\n---\n')
  return top || 'Kein Treffer im Lernmaterial.'
}

// tools the voice model AND the text agent can call
export async function handleAiTool(name: string, args: any): Promise<string> {
  if (name === 'addCanvasCard') {
    const n = await db.canvasCards.count()
    const kind = ['quiz', 'diagram', 'flashcard'].includes(args.kind) ? args.kind : 'text'
    const card: CanvasCard = {
      kind, title: CLAMP(String(args.title ?? 'Karte'), 80), content: String(args.content ?? ''),
      data: kind === 'quiz' ? { options: (args.options ?? []).map(String), answer: Math.max(0, Number(args.answer) || 0) } : kind === 'diagram' ? { svg: String(args.svg ?? '') } : kind === 'flashcard' ? { back: CLAMP(String(args.back ?? ''), 300) } : undefined,
      x: 60 + (n % 5) * 320, y: 60 + Math.floor(n / 5) * 250, w: 280, createdAt: Date.now()
    }
    await db.canvasCards.add(card)
    return `Karte "${card.title}" (${kind}) liegt auf der Leinwand.`
  }
  if (name === 'arrangeCanvas') {
    const cards = await db.canvasCards.toArray()
    const layout = args.layout ?? 'grid'
    if (layout === 'custom' && Array.isArray(args.positions)) {
      let moved = 0
      for (const p of args.positions) {
        const c = cards.find(x => x.id === Number(p.cardId) || (p.title && x.title === p.title))
        if (c?.id != null) { await db.canvasCards.update(c.id, { x: Number(p.x) || c.x, y: Number(p.y) || c.y }); moved++ }
      }
      return `${moved} Karten verschoben.`
    }
    if (layout === 'byKind') {
      let col = 0
      for (const k of ['text', 'flashcard', 'quiz', 'diagram']) {
        cards.filter(c => c.kind === k).forEach((c, i) => { if (c.id != null) db.canvasCards.update(c.id, { x: 40 + col * 320, y: 40 + i * 250 }) })
        col++
      }
      return 'Karten nach Kartentyp sortiert.'
    }
    cards.forEach((c, i) => { if (c.id != null) db.canvasCards.update(c.id, { x: 40 + (i % 5) * 320, y: 40 + Math.floor(i / 5) * 250 }) })
    return `${cards.length} Karten im Raster sortiert.`
  }
  if (name === 'clearCanvas') { await db.canvasCards.clear(); return 'Leinwand geleert.' }
  if (name === 'searchDump') return searchDump(String(args.query ?? ''))
  return `Unbekanntes Werkzeug: ${name}`
}
