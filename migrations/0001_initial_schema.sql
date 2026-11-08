PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS accas (
 id TEXT PRIMARY KEY, target_odds REAL NOT NULL, actual_odds REAL NOT NULL,
 status TEXT NOT NULL DEFAULT 'published', headline TEXT NOT NULL, analysis_note TEXT NOT NULL,
 publish_date TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS selections (
 id TEXT PRIMARY KEY, acca_id TEXT NOT NULL REFERENCES accas(id) ON DELETE CASCADE,
 event_id TEXT NOT NULL, sport_key TEXT NOT NULL, commence_time TEXT NOT NULL,
 home_team TEXT NOT NULL, away_team TEXT NOT NULL, market_key TEXT NOT NULL,
 market_name TEXT NOT NULL, selection_name TEXT NOT NULL, odds REAL NOT NULL,
 bookmaker TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_accas_publish_date ON accas(publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_selections_acca_id ON selections(acca_id,sort_order);