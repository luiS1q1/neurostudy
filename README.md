# NeuroStudy OS

KI-gestützter Lern- und Denk-Assistent für Schule und Studium. Läuft komplett lokal im Browser
(localhost), Daten in IndexedDB, KI über die Google AI API (Key selbst hinterlegt, siehe Einstellungen).

## Starten
```
start.cmd            (oder: node server\server.js)
```
Danach http://localhost:8788 öffnen.

## Module
1. **Live Voice Socratic Tutor** – Gemini Live API über WebSocket, 16 kHz PCM in (AudioWorklet),
   24 kHz PCM raus, Barge-in (Sprechen unterbricht die KI sofort), Live Function Calling
   (`startTimer`, `addFlashcard`, `triggerBlurting`, `logKnowledgeGap`).
2. **Blurting & Active Recall** – Freitext-Wiedergabe unter Zeitdruck, semantisches Diff-Audit
   durch Gemini Flash Lite (grün/gelb/rot), Auto-Flashcards aus roten Lücken.
3. **Feynman-Simulator** – Jargon-Detektor, kaputte Analogien, Scheinwissen, Einfachheits-Score 1-100.
4. **Multi-Modus-Timer** – Anti-Prokrastination 15/3, Pomodoro 25/5, Deep Work 90/15, Custom.
   Sounds komplett synthetisiert (40 Hz Binaural, Brown/White Noise), Flow-Wächter via Page Visibility.
5. **Fächer-Manager** – Fakten- vs. Transferfächer, Interleaving-Scheduler (max. 3 Fächer/Tag).
6. **Flashcards** – voller SM-2, Markdown + LaTeX (KaTeX), KI-Karten-Generator, Tasten 1-4.
7. **80/20 Pareto-Matrix** – Relevanz × Unsicherheit, Focus-Filter auf oben-rechts.

## Shortcuts
`Leertaste` Timer start/stop · `M` Mikro stumm · `1-4` Karten-Rating · `Enter` Karte aufdecken

## Setup
1. `start.cmd` starten
2. API-Key von aistudio.google.com/apikey unter Einstellungen eintragen (nur localStorage)
3. Mikrofon erlauben, Orb unten rechts anklicken -> Socratic Tutor

Hinweis: Die Voice-Engine nutzt den offiziellen JSON-Wire-Modus der Live-WebSocket-API; Serverframes
werden je nach Antwortformat als JSON oder Protobuf gelesen. Wenn dein Key kein Live-API-Access hat,
laufen alle anderen Module trotzdem komplett offline.
