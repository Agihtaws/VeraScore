import Database from 'better-sqlite3';
import path     from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = path.join(__dirname, '../../verascore.db');

export interface ScoreRecord {
  id:        number;
  address:   string;
  score:     number;
  breakdown: string; 
  txHash:    string;
  timestamp: number;
}

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    db.exec(`
      CREATE TABLE IF NOT EXISTS scores (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        address   TEXT    NOT NULL,
        score     INTEGER NOT NULL,
        breakdown TEXT    NOT NULL,
        tx_hash   TEXT    NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_scores_address
        ON scores (address, timestamp DESC);
    `);

    console.log(`[db] SQLite initialized at ${DB_PATH}`);
  }
  return db;
}

export function saveScore(
  address:   string,
  score:     number,
  breakdown: object,
  txHash:    string
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO scores (address, score, breakdown, tx_hash, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    address.toLowerCase(),
    score,
    JSON.stringify(breakdown),
    txHash,
    Date.now()
  );
}

export function getHistory(address: string): ScoreRecord[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, address, score, breakdown, tx_hash as txHash, timestamp
    FROM scores
    WHERE address = ?
    ORDER BY timestamp DESC
    LIMIT 20
  `).all(address.toLowerCase()) as ScoreRecord[];

  return rows;
}

export interface LeaderboardEntry {
  rank:      number;
  address:   string;
  score:     number;
  breakdown: string;
  txHash:    string;
  timestamp: number;
}

export function getLeaderboard(limit = 10): LeaderboardEntry[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      address,
      score,
      breakdown,
      tx_hash  AS txHash,
      timestamp
    FROM scores s1
    WHERE timestamp = (
      SELECT MAX(s2.timestamp)
      FROM scores s2
      WHERE s2.address = s1.address
        AND s2.score = (SELECT MAX(s3.score) FROM scores s3 WHERE s3.address = s1.address)
    )
    GROUP BY address
    ORDER BY score DESC, timestamp DESC
    LIMIT ?
  `).all(limit) as Omit<LeaderboardEntry, 'rank'>[];

  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

export function getTotalUniqueWallets(): number {
  const db  = getDb();
  const row = db.prepare(`SELECT COUNT(DISTINCT address) as count FROM scores`).get() as { count: number };
  return row.count;
}