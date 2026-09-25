# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Source of truth

The game design document `football-puzzle-battle-gdd-v0.4.md` (written in Turkish) is the spec. It states that every decision needed to begin development has been made, so implement from it rather than re-opening design questions. Section numbers below (§) refer to that document.

## Commands

```bash
npm run dev     # dev server at http://localhost:3000
npm run build   # production build (also type-checks)
npm run lint    # ESLint
npm test        # Vitest, all tests once
npm run test:watch
npx vitest run src/game/round.test.ts        # one file
npx vitest run -t "sudden death"             # tests whose name matches
npm run test:e2e                             # Playwright E2E (e2e/), ~4 min; reuses a running dev server
npm run test:supabase                        # live Supabase connection + RLS checks (needs .env.local)
npm run db:seed                              # copy src/data/puzzles.json into the table (--dry-run, --overwrite)
```

Tests live next to the code as `*.test.ts` (`src/game/`, `src/data/`) and run in Node; config is `vitest.config.mts`. Engine tests use fixtures in `src/game/__fixtures__/` (a fixed puzzle and a seeded RNG), not the content in `src/data/`. `src/data/content.test.ts` runs every record of the JSON backup through the admin schema (`src/data/schema.ts`). `src/data/puzzles.test.ts` tests the Supabase store against an in-memory fake (`src/test/fakeSupabase.ts`) that mimics the table's RLS; no unit test touches the network. `npm run test:supabase` runs the live checks in `*.integration.test.ts` (connection and RLS on the real table); E2E reads answers from, and cleans up in, the real table.

## Stack (§33)

Next.js 16 (App Router, `src/app`) + React 19 + TypeScript + Tailwind CSS v4. Supabase (PostgreSQL, Realtime), Vercel and Capacitor come later. Mobile-first layout at a 390px reference width.

Tailwind v4 has no `tailwind.config` file: the §22 design tokens live in the `@theme` block of `src/app/globals.css`, named exactly as in the GDD (so utilities read `bg-bg-primary`, `border-border-subtle`, `text-text-secondary`, `bg-accent`). Fonts are loaded with `next/font/google` in `src/app/layout.tsx` and exposed as `font-display` (Space Grotesk) and `font-body` (Manrope, the body default).

## Architecture

Three layers, each depending only on the one below:

1. **Round engine** (`src/game/round.ts`, `scoring.ts`, `answer.ts`, `bot.ts`): pure TypeScript, no React or timers, so it can later run server-side (§27). `round.ts` is a reducer (`tick` / `buzz` / `submit` / `reset`) for one REVEAL → BUZZ → ANSWER round. It knows nothing about puzzle types: it only reads `reveal_interval_seconds`, `correct_answer`, `answer_aliases`, `difficulty` and `bot_difficulty`. Treat it as stable; the user asked that it not change when adding puzzle types.
2. **Match layer** (`src/game/match.ts`): the 5-round schedule in §5 order, totals, Sudden Death and §12 stats. It wraps the engine instead of changing it: `observedRoundReducer` records buzz times and which side was right first, which the engine does not track.
3. **UI** (`src/components/`): `puzzles/` has one board per type behind `PuzzleBoard`, which switches on `puzzle.type` and renders a reveal stage (1-5). `match/` has the screens. `MatchScreen` owns the match state and remounts `RoundPlay` with a new `key` for every round.

Rules that live outside the engine and are easy to miss:

- Round timing: one shared reveal clock. Any buzz freezes it while that side answers, and answering is exclusive. A wrong answer, a correct one or the 8 s timeout ends only that side's round, so both sides can score in the same round (§39). A regular round ends when both sides are done or the 15 s window runs out.
- Sudden Death (§12.1) ends at the first correct answer, and `match.ts` detects this. Its points never count toward the totals, and the UI hides point values during it. It prefers an unplayed puzzle and falls back to the whole pool.
- `src/components/match/useRound.ts` is the only place wall-clock time enters. It dispatches `tick` every 50 ms, with each step clamped so background tabs pause the round instead of skipping reveals.
- `MatchScreen` waits `NEXT_ROUND_DELAY_MS` on the round result, which is longer than §11's "about 2 s", and a tap skips it.

## Adding a puzzle type or puzzle content

- A new type means a `reveal_data` shape in `src/game/types.ts` (added to the `Puzzle` union), a board in `src/components/puzzles/`, cases in `PuzzleBoard` / `PuzzleRecap`, a case in `revealCapacity` in `src/data/content.test.ts`, the type in the table's `type` check (a new migration), a reader in `validatePuzzle` (`src/data/schema.ts`) plus its entry in `schemaGuide.ts`, and a section in the admin form (`src/components/admin/draft.ts`, `TypeFields.tsx`). The engine does not change.
- Puzzles live in the Supabase `puzzles` table (`supabase/migrations/`). Columns are the §24 fields; `src/data/rows.ts` maps rows (NULL for absent optional fields) to `Puzzle`. `src/data/puzzles.ts` (server-only) is the store: the game reads with `fetchPublishedPuzzles()` using the publishable key, so RLS itself keeps drafts out of matches; the admin reads and writes with the secret key. RLS: anon/authenticated may select published rows only and hold no write privileges; only the secret key (service_role) writes. Schema changes go in a new migration file, run in the Supabase SQL Editor (the API keys cannot run DDL). `src/data/puzzles.json` is the pre-Supabase backup the table was seeded from (`npm run db:seed` adds missing rows only unless `--overwrite`); no runtime code reads it, and tests use it as an offline fixture (`src/test/snapshot.ts`). `buildSchedule` draws one random published puzzle per type; `src/app/match/page.tsx` draws the first match per request (`connection()`) so the server render and hydration agree, and rematch calls the `drawSchedule` Server Function (`src/app/match/actions.ts`), so selection never happens in the browser.
- Photo Reveal currently draws a parametrised SVG placeholder (`Illustration` in `PhotoRevealBoard.tsx`), not final art. The commissioned illustrations are a separate work package (§9.2.1).

## Progress

Built so far: the Main Menu and a full MVP 0.1 match at `/match`, which PLAY opens. It has 5 rounds against a Medium bot with a random puzzle of each type from the 50-puzzle pool (§30), round results, the match result with Sudden Death, and rematch. The unlisted `/admin` panel (no login, §29) shows counts per type, lists, edits and deletes puzzles, and bulk-imports validated JSON; its Server Functions in `src/app/admin/actions.ts` re-validate with `src/data/schema.ts` before writing `puzzles.json`, and refuse to leave a type without a published puzzle. Bulk imports always arrive as drafts (`validateBatch`), and the Drafts view (`/admin?status=draft`) publishes them in bulk or one by one. The answer box autocompletes from `src/data/names.ts`: pool answers (aliases as extra search keys) plus `src/data/player-names.json`, with list names a puzzle would accept dropped so the pool spelling is the only one offered; tapping a suggestion submits. The §23 sounds are synthesised with Web Audio in `src/components/sound/` (no audio files): `sounds.ts` defines the tones, `cues.ts` maps round-state changes to sounds, `player.ts` plays them and keeps the mute choice in localStorage (`fpb:sound`), and `SoundToggle` sits top right on the menu and match screens. Stadium ambience is left out. Not built yet: final Photo Reveal art, practice, and how-to-play.

## First milestone: MVP 0.1 (§29, §40)

Local player vs a bot in the browser: PLAY, match a bot, play 5 rounds (one of each puzzle type), buzz, answer, score, see the match result. Explicitly out of scope: login, shop, rank, ads, real multiplayer. The first-prototype main menu needs only PLAY, PRACTICE, HOW TO PLAY.

## Core game rules that code must enforce

- **Round order (§5):** Goal Map, Photo Reveal, Missing XI, Career Journey, Teammate Web. Every type uses the same REVEAL → BUZZ → ANSWER loop.
- **Reveal timing (§6.1):** 5 reveals, fixed 3 s apart, 15 s window per round. No buzz by 15 s means 0 points. Read the interval from the `reveal_interval_seconds` field even though it is always 3 in the MVP.
- **Buzz (§7):** Buzzing stops the reveal and opens an answer input with about 8 s. A wrong answer forfeits that player's round, and the opponent keeps playing.
- **Scoring (§8):** Correct at reveal 1–5 scores 1000/800/600/400/200. Wrong scores 0. No negative points in the MVP.
- **Tie-break (§12.1):** Tied after 5 rounds triggers repeated Sudden Death rounds with a random puzzle until one player answers correctly first. Applies to bot matches too, not Practice.
- **Answer validation (§26.1):** Exact match against the answer and `answer_aliases`, case-insensitive with whitespace and accents normalized. Fuzzy/typo tolerance is Phase 2.
- **Bot (§29.1):** A `bot_difficulty` field (Easy/Medium/Hard) must exist from the MVP, though only Medium is required. Buzz timing is reveal 4–5 for Easy, 2–4 weighted by puzzle difficulty for Medium, 1–3 for Hard. Accuracy is 50/70/85%, with a simulated 1.5–3 s answer delay.
- **Server authority (§27):** When real multiplayer arrives, the server owns puzzle selection, round timing, reveals, buzz time, answer checking and scoring. Structure game logic so it can move server-side and the client never decides scores.

## Content (§24–25, §30)

Puzzles live in the database, never hardcoded in components. Shared fields: ID, type, difficulty, question, correct answer, aliases, reveal data, competition, season, tags, status, plus `reveal_interval_seconds`, `image_source`, `license_type`, `answer_aliases`. The MVP target is 50 puzzles, 10 per type. §25 has a sample record.

- **Photo Reveal (§9.2.1, §35):** Uses original illustrations only, revealed piece by piece rather than blurred. `image_source` is always `illustration`, and `license_type` is unused in the MVP. Never use real player photos or match footage.
- **Goal Map (§34):** Rendered with SVG or Canvas on a top-down pitch, with no game engine.
- **Missing XI (§9.3.1):** Shows cards placed by formation position on the pitch, with the missing slot as an empty "?" card in place. Reveals are contextual clues, not player names.

## Visual style (§22)

Use these tokens as CSS variables / Tailwind theme values:

| Token | Hex |
|---|---|
| `bg-primary` | `#0B1220` |
| `bg-surface` | `#121A2A` |
| `bg-surface-alt` | `#1E2A3D` |
| `border-subtle` | `#26344A` |
| `accent` | `#3ED598` |
| `accent-hover` | `#2FBF83` |
| `text-primary` | `#F2F5F7` |
| `text-secondary` | `#8B98A9` |
| `text-muted` | `#6B7A8D` / `#4A5A70` |

- Fonts are Space Grotesk (600/700) for display and buttons, and Manrope (400/600/800) for body. Do not use Inter, Roboto, or Arial.
- Only the winning/active side's score uses `accent`. The opponent or passive side uses `text-secondary`.
- The BUZZ button is the largest, most prominent element on the match screen. Cards use 12–20px radius, `bg-surface` fill, and a `border-subtle` border. Primary CTAs are filled `accent` with dark text, secondary buttons are outlined, and tertiary actions are ghost style.
- Approved mockups of the main menu, match, round result, and match result screens are at https://claude.ai/artifact/1X7aVnxrTpDmTSWTYj4DYP. Check them before building UI.
