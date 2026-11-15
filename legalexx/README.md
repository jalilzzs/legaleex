# LegalExx

Open-web legal research with automatic source classification, plus an AI exposé generator that exports a styled PDF. Built for law students.

## Features
- **Open web search** (Serper or Brave) for any legal, political or academic topic.
- **Smart source classifier** — every result is tagged on the fly: official gazette / government / parliament / court, academic (`.edu`, `.ac.*`, `univ-*.dz`, ASJP, journals), international body (UN, ICJ, `.int`, Library of Congress…), news media, community/unverified, or unclassified. Each result shows a trust level, organisation tag, snippet and a direct link.
- **AI exposé generator** — field, topic, sections, pages, subheadings, cover details; formal academic text (Arabic by default, also FR/EN) with `[n]` citations and a "points to verify" list.
- **Editor** — edit every heading and paragraph and choose which sources appear in the references.
- **PDF export (Puppeteer)** — cover page, plan page, underlined headings, page numbers, and a final References & Sources page with verification links.
- **Demo mode** — with no API keys, search and AI return clearly labelled mock responses so you can test the UI and PDF locally.

## Structure
```
legalexx/
├── package.json            root scripts (install:all, dev, build, start)
├── client/                 React + Vite + Tailwind
└── server/                 Node + Express
    └── src/{index.js, routes/api.js, lib/{classifier,search,ai,template,pdf}.js}
```

## Local setup
Requires Node 18+ (Node 20+ recommended).

```bash
npm run install:all
npm run dev
```

Open http://localhost:5173 (API on port 4000). Without keys the app runs in demo mode.

To test with real services locally, copy `server/.env.example` to `server/.env` and fill in the keys.

## Environment variables
Set these in your **hosting platform's environment settings** (never commit them):

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | AI writing. Missing → placeholder exposé |
| `SERPER_API_KEY` or `BRAVE_API_KEY` | Open-web search. Missing → demo results |
| `SEARCH_PROVIDER` | Optional: `serper` or `brave` when both keys exist |
| `CLAUDE_MODEL` | Optional model override |
| `PORT` | Server port (most hosts set this automatically) |
| `CLIENT_ORIGIN` | Optional: allowed frontend origin(s) if the client is hosted separately |
| `VITE_API_URL` | Client build-time: API base URL if the API is on another origin |

This project contains no hosting or deployment config files; configure your platform yourself.

## Production notes
- `npm run build && npm start` builds the client and serves it from Express. If you host the two parts separately, set `VITE_API_URL` for the client build and `CLIENT_ORIGIN` for the server.
- Puppeteer needs Chromium and its system libraries on the host.
- PDF fonts (Amiri, Cairo) load from Google Fonts at render time; self-host them in `server/src/lib/template.js` for offline use.

## Important limits
- The classifier is a **heuristic**: it recognises known organisations and domain patterns. Unknown sites are labelled "Unclassified — verify". It does not prove a source is accurate.
- The AI is told to rely on high-trust sources and to flag uncertain details, but it can still make legal mistakes. Always check each article, date and citation at the linked source before submitting.
- Low-trust (community) results are shown in search, but are excluded from the sources given to the AI.
