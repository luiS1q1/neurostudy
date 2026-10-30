import { useEffect, useRef, useState } from 'react'
import { Plus, LayoutGrid, Trash2, ZoomIn, ZoomOut, Frame, Type, Shapes } from 'lucide-react'
import { db, useCanvasCards, CanvasCard } from '../store'

export default function SpaceView() {
  const cards = useCanvasCards()
  const [pan, setPan] = useState({ x: 60, y: 40 })
  const [zoom, setZoom] = useState(0.95)
  const panRef = useRef(pan); panRef.current = pan
  const zoomRef = useRef(zoom); zoomRef.current = zoom
  const dragRef = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number } | null>(null)
  const [live, setLive] = useState<Record<number, { x: number; y: number }>>({})
  const liveMirror = useRef(live); liveMirror.current = live
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [flipped, setFlipped] = useState<Record<number, boolean>>({})
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const old = zoomRef.current
      const next = Math.min(2, Math.max(0.3, old * (e.deltaY > 0 ? 0.9 : 1.1)))
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const p = panRef.current
      setPan({ x: mx - ((mx - p.x) / old) * next, y: my - ((my - p.y) / old) * next })
      setZoom(next)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    const mv = (e: PointerEvent) => {
      const d = dragRef.current
      if (d) setLive(prev => ({ ...prev, [d.id]: { x: d.ox + (e.clientX - d.sx) / zoomRef.current, y: d.oy + (e.clientY - d.sy) / zoomRef.current } }))
    }
    const up = () => {
      const d = dragRef.current
      if (d) { const pos = liveMirror.current[d.id]; if (pos) db.canvasCards.update(d.id, { x: Math.round(pos.x), y: Math.round(pos.y) }); dragRef.current = null; setLive(prev => { const n = { ...prev }; delete n[d.id]; return n }) }
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
    return () => { el.removeEventListener('wheel', wheel); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
  }, [])

  const startDrag = (e: React.PointerEvent, c: CanvasCard) => {
    if (c.id == null) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { id: c.id, sx: e.clientX, sy: e.clientY, ox: c.x, oy: c.y }
  }
  const bgDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const p = panRef.current
    const move = (ev: PointerEvent) => setPan({ x: p.x + ev.clientX - e.clientX, y: p.y + ev.clientY - e.clientY })
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const toWorld = (cx: number, cy: number) => {
    const rect = wrapRef.current!.getBoundingClientRect()
    return { x: (cx - rect.left - panRef.current.x) / zoomRef.current, y: (cy - rect.top - panRef.current.y) / zoomRef.current }
  }
  const addCard = (kind: CanvasCard['kind']) => {
    const pos = toWorld(window.innerWidth / 2, window.innerHeight / 2)
    db.canvasCards.add({ kind, title: kind === 'quiz' ? 'Quizfrage' : kind === 'diagram' ? 'Diagramm' : 'Notiz', content: '', x: Math.round(pos.x - 140), y: Math.round(pos.y - 60), w: 280, createdAt: Date.now() })
  }
  const arrange = async () => { const cs = await db.canvasCards.toArray(); cs.forEach((c, i) => { if (c.id != null) db.canvasCards.update(c.id, { x: 40 + (i % 5) * 320, y: 40 + Math.floor(i / 5) * 250 }) }) }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-6 py-3 border-b border-white/[0.06] bg-ink-900">
        <Frame size={16} className="text-indigo-400" />
        <span className="text-sm font-medium">Space</span>
        <span className="text-[10px] text-zinc-600 font-mono hidden md:inline">unendliche Leinwand · der Voice-Tutor legt hier Karten ab</span>
        <div className="flex-1" />
        <button className="btn-ghost flex items-center gap-1.5 text-xs" onClick={() => addCard('text')}><Type size={13} /> Notiz</button>
        <button className="btn-ghost flex items-center gap-1.5 text-xs" onClick={() => addCard('quiz')}><Shapes size={13} /> Quiz</button>
        <button className="btn-ghost flex items-center gap-1.5 text-xs" onClick={arrange}><LayoutGrid size={13} /> Sortieren</button>
        <button className="btn-ghost !px-2" onClick={() => setZoom(z => Math.min(2, z * 1.15))}><ZoomIn size={13} /></button>
        <button className="btn-ghost !px-2" onClick={() => setZoom(z => Math.max(0.3, z * 0.87))}><ZoomOut size={13} /></button>
        <button className="btn-ghost !px-2 text-red-300/80" onClick={() => { if (cards.length && confirm('Alle Karten von der Leinwand löschen?')) db.canvasCards.clear() }}><Trash2 size={13} /></button>
      </div>
      <div ref={wrapRef} className="relative flex-1 overflow-hidden bg-ink-950" onPointerDown={bgDown} style={{ cursor: 'grab' }}>
        {cards.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center max-w-sm">
              <Plus size={20} className="mx-auto text-zinc-700" />
              <div className="text-sm text-zinc-500 mt-2">Leere Leinwand. Zieh Notizen drauf oder sag im Voice-Chat „zeig mir das als Diagramm" – der Tutor legt die Karten hier ab.</div>
            </div>
          </div>
        )}
        <div className="absolute inset-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          {cards.map(c => {
            const pos = live[c.id!] ?? { x: c.x, y: c.y }
            const isDragging = dragRef.current?.id === c.id
            return (
              <div key={c.id} onPointerDown={e => startDrag(e, c)}
                className={`absolute card-surface shadow-xl ${isDragging ? 'opacity-80' : ''}`}
                style={{ left: pos.x, top: pos.y, width: c.w, cursor: 'grab' }}>
                <div className="flex items-center justify-between px-3 pt-2">
                  <span className={`text-[10px] font-mono uppercase tracking-wide ${c.kind === 'quiz' ? 'text-amber-400' : c.kind === 'diagram' ? 'text-sky-400' : c.kind === 'flashcard' ? 'text-emerald-400' : 'text-zinc-500'}`}>{c.kind}</span>
                  <button className="text-zinc-600 hover:text-zinc-300" onPointerDown={e => e.stopPropagation()} onClick={() => c.id != null && db.canvasCards.delete(c.id)}><Trash2 size={11} /></button>
                </div>
                <div className="px-3 pb-3">
                  <input className="w-full bg-transparent text-sm font-medium text-zinc-100 outline-none mt-1" value={c.title} onChange={e => c.id != null && db.canvasCards.update(c.id, { title: e.target.value })} />
                  {c.kind === 'quiz' && c.data?.options?.length ? (
                    <div className="mt-2 space-y-1.5">
                      <div className="text-xs text-zinc-300 whitespace-pre-wrap">{c.content}</div>
                      {c.data.options.map((o, i) => {
                        const picked = answers[c.id!]
                        const revealed = picked != null
                        const isAnswer = i === c.data!.answer
                        return (
                          <button key={i} disabled={revealed} onClick={() => setAnswers(a => ({ ...a, [c.id!]: i }))}
                            className={`w-full text-left text-xs rounded-md border px-2.5 py-1.5 transition-colors ${revealed ? (isAnswer ? 'border-emerald-500/60 text-emerald-300 bg-emerald-500/10' : i === picked ? 'border-red-500/60 text-red-300 bg-red-500/10' : 'border-white/[0.06] text-zinc-500') : 'border-white/[0.08] text-zinc-300 hover:border-indigo-500/60'}`}>
                            {String.fromCharCode(65 + i)}. {o}
                          </button>
                        )
                      })}
                      {answers[c.id!] != null && answers[c.id!] !== c.data.answer && <div className="text-[10px] text-emerald-400">Richtig wäre: {c.data.options[c.data.answer ?? 0]}</div>}
                    </div>
                  ) : c.kind === 'diagram' && c.data?.svg ? (
                    <div className="mt-2 rounded-lg bg-ink-900 p-2 [&>svg]:max-w-full" dangerouslySetInnerHTML={{ __html: c.data.svg }} />
                  ) : c.kind === 'flashcard' ? (
                    <button className="w-full text-left mt-2" onPointerDown={e => e.stopPropagation()} onClick={() => setFlipped(f => ({ ...f, [c.id!]: !f[c.id!] }))}>
                      <div className="text-xs text-zinc-300 whitespace-pre-wrap">{c.content || c.title}</div>
                      <div className={`mt-2 text-xs whitespace-pre-wrap rounded-md border border-white/[0.08] px-2.5 py-2 ${flipped[c.id!] ? 'text-emerald-300 border-emerald-500/40' : 'text-zinc-600'}`}>{flipped[c.id!] ? (c.data?.back || '(keine Rückseite)') : 'Zum Aufdecken klicken'}</div>
                    </button>
                  ) : (
                    <textarea className="w-full mt-1 bg-transparent text-xs text-zinc-300 outline-none resize-none whitespace-pre-wrap" rows={Math.max(2, Math.min(10, (c.content.match(/\n/g)?.length ?? 0) + 3))} value={c.content} placeholder="Inhalt …" onChange={e => c.id != null && db.canvasCards.update(c.id, { content: e.target.value })} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
