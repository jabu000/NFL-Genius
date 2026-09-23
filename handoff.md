# Handoff

## 1. Goal
Build a local site that researches the NFL daily and projects every starting QB, RB1, RB2, WR1, WR2, WR3 and TE1.

- **Player pages.** Each player gets a short daily "why" paragraph. The last 10 days stay on the page and can be scrolled; anything older disappears. A DraftKings line appears on the page when its value clears a threshold.
- **Confidence Board.** A second page ranks players by projection confidence next to DraftKings prop lines (pass/rush/rec yards, receptions, TDs, and more).

User decisions:
- Run locally for now.
- Use a free LLM API for write-ups: Gemini or Groq free tier, with a template fallback.
- Use The Odds API for DraftKings lines.

## 2. Current State
- The first full version is built. Build, lint, typecheck and all 24 unit tests pass.
- `npm run seed:mock` produces 10 days × 224 players of demo data. The UI was verified with Playwright screenshots (desktop, dark mode, mobile) for the player grid, the player page with the 10-day carousel and value-bet callout, and the Confidence Board.
- `npm run research` was verified against **real 2026 data** from nflverse (stats, schedule, spreads/totals, projected QBs). It produced 224 real starters with matchup-aware write-ups.
- **ESPN was blocked by the sandbox network (HTTP 403)**, so the ESPN depth-chart and injury parsers have **not** been run against live responses yet.
- **The Odds API and the Gemini/Groq calls have not been run live** either: no keys were available. Their parsers are unit-tested against documented response shapes.

## 3. Active Files
- `src/lib/pipeline.ts`: core daily run (starters → projections → edges → write-ups → save → prune)
- `src/lib/sources/{espn,nflverse,oddsApi,live,mock,http}.ts`: data adapters
- `src/lib/model/{project,confidence,edge,depth}.ts`: projection model
- `src/lib/llm/*`: write-up providers and prompt
- `src/lib/db/{schema.sql,index.ts,queries.ts}`: storage and page queries
- `src/lib/config.ts`: every tunable (thresholds, retention, priors, markets)
- `src/app/*`, `src/components/*`: UI
- `scripts/research.ts`, `scripts/seed-mock.ts`
- `tests/*.test.ts`

## 4. Changes Made
- Scaffolded Next.js 16, React 19, Tailwind v4 and TypeScript, with SQLite through better-sqlite3, Vitest and ESLint. The plan said Next 15; 16 was the current release.
- Projection model:
  - Recency-weighted baseline, shrunk toward last season or a slot prior.
  - Adjustments for defense vs. position, implied team total, game script, usage trend, teammates ruled out, injury and venue.
  - Normal or Poisson distributions per stat.
  - 0–100 confidence score.
- Odds math: American odds → probability, de-vig, edge. The model is blended 65/35 with the market (`MODEL_WEIGHT`) so edges aren't overstated.
- Stored bets in a `bets` table instead of the SQL view in the plan, because the CDF math lives in TypeScript.
- Added the nflverse `games.csv` schedule as a fallback for ESPN. It supplies games, consensus spread/total and projected starting QBs. nflverse headshots are used when ESPN has none.
- Added Odds API credit budgeting: a cache age limit, a 7-day window, a credit reserve, and cached lines stored in `prop_lines`.
- The first live run wipes demo data automatically.
- Wrote README, CLAUDE.md and this handoff.

## 5. Failed Attempts
- ESPN endpoints (`site.api.espn.com`) returned 403 through the sandbox proxy, so the parsers could not be tested live. This led to adding the nflverse schedule fallback, which works.
- The first mock prop lines were too far from the model, and value bets were unrealistically common. Mock lines now track each player's averages, and the model/market blend was added. Mock edges are still larger than real books would allow; that only affects demo data.
- Template write-ups lowercased team codes ("pIT allows…"). Fixed so acronyms are left alone.

## 6. Next Steps
1. Run `npm run research` on a machine with open internet and confirm that the ESPN depth charts and injuries parse. Check the log counts: teams, depth players, injury designations. Adjust `toPosition()` and the key names in `sources/espn.ts` if the shape differs.
2. Add `ODDS_API_KEY` and confirm DraftKings props match players. Check the log line "N DraftKings props matched". Name mismatches go through `normName()`.
3. Add `GEMINI_API_KEY` (or `GROQ_API_KEY`) and review LLM write-up quality. Tune `SYSTEM_PROMPT` in `src/lib/llm/prompt.ts`.
4. Backtest: store results after games, and calibrate confidence and `MODEL_WEIGHT` against actual outcomes.
5. Nice-to-haves:
   - Per-player projection-vs-actual history chart.
   - Weather (wind) for passing stats.
   - Snap-count data from nflverse for role stability.
   - Deploy: move the pipeline to GitHub Actions and the DB to hosted Postgres or Turso.
