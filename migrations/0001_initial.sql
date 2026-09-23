CREATE TABLE IF NOT EXISTS streamers (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 display_name TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
 streamer_id INTEGER PRIMARY KEY,
 voice TEXT DEFAULT '',
 rate REAL DEFAULT 1.0,
 pitch REAL DEFAULT 1.0,
 volume REAL DEFAULT 1.0,
 filter_enabled INTEGER DEFAULT 1,
 blocked_words TEXT DEFAULT '[]',
 FOREIGN KEY(streamer_id) REFERENCES streamers(id)
);

CREATE TABLE IF NOT EXISTS tts_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 streamer_id INTEGER,
 message TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued',
 donation_amount REAL DEFAULT 0,
 donation_currency TEXT DEFAULT 'USD',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tts_events_streamer_created
ON tts_events(streamer_id, created_at DESC);
