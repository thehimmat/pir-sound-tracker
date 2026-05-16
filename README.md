# PIR Sound Tracker

A real-time noise monitoring dashboard for **Portland International Raceway (PIR)**. Every second, a background worker scrapes the raceway's live sound meter display, extracts the dB reading via OCR, and stores it in a cloud database. Anyone can view the current level, today's trace, or historical data going back to when tracking began — no login required.

**Live site:** [pir-sound-tracker.vercel.app](https://pir-sound-tracker.vercel.app)

---

## Why this exists

PIR operates a sound level meter with a microphone positioned 50 feet from the track. The reading is published live on the [raceway's website](http://portlandraceway.com/?/about/noise_information), but the page offers no history, no charts, and no way to know if a violation occurred earlier in the day. This project captures and stores every second of that data, making it available for residents, journalists, or anyone with an interest in the noise record.

---

## Noise limits

Under a 1989 agreement with North Portland neighborhood groups, Portland city code sets a trackside limit of **105 dBA**. In practice, motorsport events use a stricter operational limit of **103 dBA** — sound engineers determined this more accurately corresponds to 65 dB at the nearest residence. Vehicles exceeding 103 dBA are subject to removal from competition.

The facility is permitted up to four variance events per year at higher limits. 2026 approved events:

| Event | Dates | Limit |
|---|---|---|
| Rose Cup Races | Jul 10–12 | 112 dB |
| NTT IndyCar Series | Aug 13–16 (+ 2 TBD test days) | 115 dB |
| Sovren / ABFM | Sep 4–6 | 110 dB |

On variance event days, the threshold line on charts automatically adjusts to the permitted limit for that event and a banner is shown on the Live and Today views.

---

## How it works

```
PIR website (JPEG) → poller → Sharp (crop + threshold) → Tesseract OCR → Supabase
                                                                              ↓
                                                             Vercel API → React frontend
                                                                              ↑
                                                             WebSocket (live readings)
```

1. **Fetch** — the poller fetches a JPEG snapshot of PIR's meter display every second, cache-busted with a timestamp query param.
2. **Blank check** — average brightness > 240 → `status=blank` (display is off).
3. **Stale check** — pixel hash matches previous frame for >10 s → `status=stale`.
4. **Preprocess** — [Sharp](https://sharp.pixelplumbing.com/) crops the region containing the LAFmax digit and applies a threshold to produce a clean black-and-white image.
5. **OCR** — [Tesseract.js](https://tesseract.projectnaptha.com/) (English, page segmentation mode 7) extracts the numerical value.
6. **Parse & store** — a regex extracts the dB integer; the row is inserted into Supabase with a `status` of `ok`, `ocr_fail`, `error`, `blank`, or `stale`.
7. **Broadcast** — the new reading is broadcast over a WebSocket to all connected browser clients for live updates.

Because readings are extracted from an image rather than a direct sensor feed, occasional OCR misreads can occur — most often appearing as a sudden isolated spike or dip. These are artefacts, not real changes in noise level.

---

## Tech stack

| Layer | Technology |
|---|---|
| **Poller** | Node.js 22, TypeScript, [Sharp](https://sharp.pixelplumbing.com/), [Tesseract.js](https://tesseract.projectnaptha.com/), `ws` |
| **Database** | [Supabase](https://supabase.com/) (Postgres), SQL RPCs for aggregated summaries |
| **API** | Vercel serverless functions (TypeScript) |
| **Frontend** | React 18, [Recharts](https://recharts.org/), Vite |
| **Poller hosting** | [Fly.io](https://fly.io/) (always-on, `sjc` region, 512 MB) |
| **Web hosting** | [Vercel](https://vercel.com/) |
| **Uptime monitoring** | UptimeRobot — pings `/health` every 5 min, alerts after 1 h downtime |
| **Monorepo** | npm workspaces (`packages/types`, `packages/db`, `apps/poller`, `apps/web`, `api/`) |

---

## Repository structure

```
pir-sound-tracker/
├── apps/
│   ├── poller/          # Background worker — fetch, OCR, store, WebSocket server
│   └── web/             # React SPA — live view, day view, history, about
├── api/                 # Vercel serverless API routes
│   ├── readings/        # GET /api/readings/hour, /day, /window
│   └── summary/         # GET /api/summary/daily, /all
├── packages/
│   ├── db/              # Supabase client wrappers (shared by poller + api)
│   └── types/           # Shared TypeScript types
└── vercel.json          # Build config + /api rewrite rules
```

---

## Running locally

**Prerequisites:** Node.js 22+, a Supabase project, and access to the PIR image URL.

```bash
git clone https://github.com/thehimmat/pir-sound-tracker.git
cd pir-sound-tracker
npm install
```

Create a `.env` file in the root:

```env
IMAGE_URL=<url of the PIR meter JPEG>
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

Start everything:

```bash
npm run dev          # poller + API + web, hot-reloaded
npm run dev:poller   # just the poller
npm run dev:web      # just the frontend (uses Vite dev server)
```

The frontend will be at `http://localhost:5173`. The poller WebSocket server listens on port 3001 by default. Set `MOCK_MODE=true` in `.env` to run the poller without the live image feed (generates synthetic readings).

---

## Deploying the poller

The poller runs on Fly.io as an always-on container. The Docker image is built from the monorepo root so all workspace packages are available.

```bash
# From the repo root:
fly deploy --config apps/poller/fly.toml --dockerfile apps/poller/Dockerfile

# Secrets (set once):
fly secrets set IMAGE_URL=... SUPABASE_URL=... SUPABASE_ANON_KEY=... \
  --app pir-sound-tracker-poller
```

The container exposes a `/health` endpoint on port 8080 that returns `{"status":"ok"}` as long as the poll loop has run within the last 10 seconds. Fly uses this for its own health checks; UptimeRobot uses it for external uptime monitoring.

---

## Official noise records & complaints

All noise recordings captured by PIR's sound level meter are held on file and provided to the City of Portland's **Noise Control Officer** on request. The Noise Control Officer is the official custodian of this data for regulatory and enforcement purposes.

Residents can report a noise concern at:
[portland.gov/oni/noise-complaints](https://www.portland.gov/oni/noise-complaints)

---

## License

MIT License

Copyright (c) 2024 Himmat Singh Khalsa

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
