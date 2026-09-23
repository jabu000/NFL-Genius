CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  team         TEXT NOT NULL,
  position     TEXT NOT NULL,
  slot         TEXT NOT NULL,
  headshot_url TEXT,
  injury       TEXT NOT NULL DEFAULT 'Healthy',
  updated      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id      TEXT PRIMARY KEY,
  season  INTEGER NOT NULL,
  week    INTEGER NOT NULL,
  home    TEXT NOT NULL,
  away    TEXT NOT NULL,
  kickoff TEXT NOT NULL,
  spread  REAL,
  total   REAL
);

-- One row per player, research date and stat.
CREATE TABLE IF NOT EXISTS projections (
  player_id  TEXT NOT NULL,
  date       TEXT NOT NULL,
  game_id    TEXT,
  opponent   TEXT,
  stat       TEXT NOT NULL,
  mean       REAL NOT NULL,
  stdev      REAL NOT NULL,
  confidence INTEGER NOT NULL,
  PRIMARY KEY (player_id, date, stat)
);

-- The daily "why" paragraph. Kept for RETENTION_DAYS, then pruned.
CREATE TABLE IF NOT EXISTS writeups (
  player_id   TEXT NOT NULL,
  date        TEXT NOT NULL,
  body        TEXT NOT NULL,
  key_factors TEXT NOT NULL,
  source      TEXT NOT NULL,
  PRIMARY KEY (player_id, date)
);

-- Latest DraftKings line per game/player/stat (cached to save Odds API credits).
CREATE TABLE IF NOT EXISTS prop_lines (
  game_id     TEXT NOT NULL,
  player_name TEXT NOT NULL,
  stat        TEXT NOT NULL,
  line        REAL NOT NULL,
  over_price  REAL,
  under_price REAL,
  book        TEXT NOT NULL,
  fetched_at  TEXT NOT NULL,
  PRIMARY KEY (game_id, player_name, stat)
);

-- Projection vs line comparison for each research date.
CREATE TABLE IF NOT EXISTS bets (
  player_id    TEXT NOT NULL,
  date         TEXT NOT NULL,
  stat         TEXT NOT NULL,
  line         REAL NOT NULL,
  over_price   REAL,
  under_price  REAL,
  projection   REAL NOT NULL,
  lean         TEXT NOT NULL,
  model_prob   REAL NOT NULL,
  implied_prob REAL NOT NULL,
  edge         REAL NOT NULL,
  confidence   INTEGER NOT NULL,
  PRIMARY KEY (player_id, date, stat)
);

CREATE INDEX IF NOT EXISTS idx_projections_date ON projections(date);
CREATE INDEX IF NOT EXISTS idx_writeups_date ON writeups(date);
CREATE INDEX IF NOT EXISTS idx_bets_date ON bets(date);
