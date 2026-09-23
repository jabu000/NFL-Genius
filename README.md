# NFL Genius

A local site that researches the NFL every day and projects performance for every starting **QB, RB1, RB2, WR1, WR2, WR3 and TE1** (224 players). Each player gets a new "why" paragraph every day, and the last **10 days** stay on the player page so you can scroll back through them. A **Confidence Board** ranks every projection by model confidence next to its **DraftKings** prop line and flags value bets.

## Quick start

```bash
npm install
cp .env.example .env        # add keys (all optional)
npm run seed:mock           # 10 days of demo data, no keys needed
npm run dev                 # http://localhost:3000
```

For real data:

```bash
npm run research            # run once a day
```

The first live run clears the demo data.

## Data sources (all free except the optional paid odds tier)

| What | Source | Key |
| --- | --- | --- |
| Weekly player stats, headshots | [nflverse](https://github.com/nflverse/nflverse-data) releases | none |
| Schedule, consensus spread/total, projected starting QB | nflverse `games.csv` | none |
| Depth charts, injuries, schedule | ESPN public JSON (unofficial) | none |
| DraftKings player props + game lines | [The Odds API](https://the-odds-api.com) | `ODDS_API_KEY` |
| Daily write-ups | Google Gemini free tier, or Groq free tier | `GEMINI_API_KEY` / `GROQ_API_KEY` |

Every source is optional. When a source is missing, the pipeline degrades:

- With no ESPN, starters come from recent usage plus the nflverse projected QB.
- With no odds key, lines show as "No DraftKings line".
- With no LLM key, write-ups come from templates.

### The Odds API credits

The free tier gives 500 credits a month. Props cost **1 credit per market per game**, so one full slate with the 6 default markets costs about 100 credits. The pipeline:

- only refreshes a game's props when the cached lines are older than `ODDS_MAX_AGE_HOURS` (default 24);
- only fetches games in the next 7 days;
- stops when fewer than `ODDS_CREDIT_RESERVE` credits remain.

Daily full-slate refreshes need a paid plan. Otherwise set `ODDS_MAX_AGE_HOURS=72` or trim `ODDS_MARKETS`.

## Run it automatically every day

### Option A: GitHub Actions (recommended)

`.github/workflows/daily-research.yml` runs `npm run research` every day at 13:00 UTC (9 AM Eastern in summer, 8 AM in winter).

- Each run restores the database from the **`data`** branch, researches, and pushes the database back as a single commit that replaces the previous one. History doesn't grow, and the 10-day write-up history and the odds cache carry over between runs.
- Dates follow US Eastern time.

Setup:

1. Add any keys you have as repository secrets (**Settings → Secrets and variables → Actions → New repository secret**): `ODDS_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`. All are optional.
2. The workflow only runs from the default branch, so merge it to `main`.
3. Optionally start the first run now: **Actions → Daily research → Run workflow**.
4. On your computer, stop `npm run dev`, then run:
   ```bash
   npm run pull-data   # downloads the latest database from the data branch
   npm run dev
   ```

If a run fails (for example, no data could be fetched), the `data` branch keeps the previous day's research, and GitHub emails you about the failed run.

### Option B: cron on your own machine

macOS/Linux (`crontab -e`), 9am daily:

```
0 9 * * * cd /path/to/NFL-Genius && /usr/local/bin/npm run research >> data/research.log 2>&1
```

Windows: Task Scheduler → Create Basic Task → Daily → Program `cmd`, arguments `/c cd /d C:\path\to\NFL-Genius && npm run research`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the site locally |
| `npm run research` | Daily research pipeline (live data) |
| `npm run seed:mock` | Replace the DB with 10 days of demo data |
| `npm run pull-data` | Download the database published by the daily GitHub Action |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |

Projections are model estimates for research and entertainment. Bet responsibly.
