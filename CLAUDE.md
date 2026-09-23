# CLAUDE.md

Guidance for Claude (and humans) working in this repo. **Read `handoff.md` first**, and update it at the end of every session.

## What this is
NFL Genius is a local Next.js site plus a daily research pipeline. It projects every starting QB1, RB1, RB2, WR1, WR2, WR3 and TE1 (32 teams × 7 = 224 players).

- Each player gets a daily "why" paragraph. Paragraphs are kept for 10 days, and the player page has a carousel for scrolling through them.
- The `/confidence` board ranks projections by confidence against DraftKings prop lines.
- Value bets are shown on the player page only when they clear the thresholds.

## Commands
- `npm run dev`: site at http://localhost:3000
- `npm run research`: daily pipeline (live sources)
- `npm run seed:mock`: wipe the DB and load 10 days of demo data (no keys needed)
- `npm run pull-data`: download the DB that the daily GitHub Action publishes to the `data` branch
- `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`

## Stack
- Next.js 16 (App Router, server components read SQLite directly), React 19, Tailwind v4, TypeScript.
- SQLite via `better-sqlite3` at `data/nfl-genius.db` (gitignored). Override the path with `NFL_GENIUS_DB`.
- `tsx` runs the scripts, and Vitest runs the tests.

## Architecture
```
scripts/research.ts       live run: gatherLiveInputs → runResearch
scripts/seed-mock.ts      10× runResearch with generateMockInputs
scripts/pull-data.ts      fetch origin/data:nfl-genius.db into data/ (removes stale -wal/-shm first)
.github/workflows/daily-research.yml   daily 13:00 UTC: restore DB from `data` branch → research → force-push DB to `data`
src/lib/pipeline.ts       runResearch(): starters → project → compare to lines → write-ups → save → prune
src/lib/sources/          espn.ts, nflverse.ts (stats + schedule), oddsApi.ts, live.ts (orchestration + odds credit budget), mock.ts, http.ts
src/lib/model/            project.ts (baseline + matchup adjustments), confidence.ts, edge.ts (odds math), depth.ts (starter selection)
src/lib/llm/              gemini.ts, groq.ts, template.ts, prompt.ts, index.ts (provider choice + batching + fallback)
src/lib/db/               schema.sql, index.ts (connection, pruneOld), queries.ts (page reads, server-only)
src/lib/config.ts         ALL tunables: RETENTION_DAYS, VALUE_EDGE, VALUE_MIN_CONFIDENCE, MODEL_WEIGHT, priors, markets
src/app/                  / (players), /player/[id], /confidence
src/components/           PlayerGrid, WriteupCarousel, ValueBetCallout, ConfidenceTable, badges
```
Every source produces a `ResearchInputs` object (`src/lib/types.ts`), so live and mock data run through identical pipeline code.

## Conventions and rules
- **Retention.** `pruneOld()` deletes writeups, projections and bets with `date < today − (RETENTION_DAYS − 1)` after every run. The player page also filters to that window.
- **Value bets.** A bet qualifies when `edge ≥ VALUE_EDGE` (5%) and `confidence ≥ VALUE_MIN_CONFIDENCE` (60).
  - Edge = blended probability − de-vigged DraftKings probability.
  - Blended probability = `MODEL_WEIGHT` × model + (1 − `MODEL_WEIGHT`) × market.
- **Distributions.** Counts (receptions, TDs, INTs, anytime TD) use a Poisson distribution, and yards and attempts use a normal. Anytime TD is stored as expected TDs and displayed as P(≥1).
- **Starters.** QBs follow the depth chart, then the nflverse projected QB. RB, WR and TE are ordered by recent usage, with depth rank as a tiebreak. Players ruled Out are skipped.
- **Name matching.** Names are matched across sources with `normName()`, and player ids are `playerId(name, position)`.
- **Degrade, don't crash.** Each source call is wrapped in `attempt()`. The run aborts only when there is no roster or stats data at all, and then leaves existing research untouched.
- **Write-ups.** The LLM must use only the provided facts. A failed batch falls back to templates, and three failures in a row switch the rest of the run to templates.
- **Daily automation.** The GitHub Action keeps the DB on the orphan `data` branch as a single commit that is force-pushed every run; never merge that branch. It runs with `TZ=America/New_York`, so research dates are Eastern. Scripts that copy or publish the DB must call `closeDb()`, which checkpoints the WAL; otherwise the `.db` file can be missing recent writes.
- **Secrets.** Never commit keys. In CI, keys come from repository secrets. `.env` is gitignored, and `.env.example` documents every variable.

## Env vars
`ODDS_API_KEY`, `ODDS_MAX_AGE_HOURS`, `ODDS_MARKETS`, `ODDS_CREDIT_RESERVE`, `LLM_PROVIDER` (gemini|groq|template), `GEMINI_API_KEY`, `GEMINI_MODEL`, `GROQ_API_KEY`, `GROQ_MODEL`, `LLM_DELAY_MS`, `NFL_SEASON`, `RESEARCH_DATE`, `NFL_GENIUS_DB`.

## Known caveats
- ESPN endpoints are unofficial and may change shape. Their parsers are defensive and isolated in `sources/espn.ts`.
- The Odds API free tier (500 credits a month) cannot refresh every prop every day. See the README.
