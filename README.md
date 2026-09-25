# Football Puzzle Battle

A 1v1 football puzzle game: race the opponent to solve five visual puzzles, buzz
early for more points. Next.js 16 (App Router) + React 19 + Tailwind CSS v4, with
puzzle content in Supabase. The game design document is
`football-puzzle-battle-gdd-v0.4.md`; working notes for developers are in `CLAUDE.md`.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill it in, see below
npm run dev                  # http://localhost:3000
```

The puzzle admin panel is at `/admin` (not linked from the game).

## Environment variables

| Variable | Where it is used |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (browser and server) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Read-only key; Row Level Security limits it to published puzzles |
| `SUPABASE_SECRET_KEY` | Server only: the admin panel's writes. Never expose it to the browser |
| `ADMIN_PANEL_PASSWORD` | Password for `/admin`; at least 16 characters, long and random |

`.env.local` is ignored by git; `.env.example` lists the names without values.

## Deploying to Vercel

Vercel does not read `.env.local`. Add **all four variables above** in the Vercel
dashboard under *Project → Settings → Environment Variables* (for Production, and
Preview if you use preview deployments), then redeploy.

**`ADMIN_PANEL_PASSWORD` must be set there too.** Without it the admin panel does not
open with an empty or default password: it fails closed. Every `/admin` page answers
with an error (HTTP 503, "ADMIN_PANEL_PASSWORD is not set"), and the admin Server
Functions refuse to run. Use a long random password (at least 16 characters) and do
not reuse the one from your machine unless you mean to. Changing it signs every
browser out of the panel.

## Database

The `puzzles` table and its Row Level Security are defined in
`supabase/migrations/`. Run a new migration file in the Supabase SQL Editor (the API
keys cannot change the schema).

```bash
npm run db:seed     # copy src/data/puzzles.json into the table (adds missing rows only)
npm run db:export   # overwrite src/data/puzzles.json with the table (manual backup)
```

## Tests

```bash
npm test               # unit tests, offline
npm run test:supabase  # live checks against the Supabase project in .env.local
npm run test:e2e       # Playwright end-to-end tests, about 4 minutes
```
