import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure server/data directory exists
const DB_DIR = path.resolve(__dirname, '../data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

export const DB_PATH = process.env.DB_PATH 
  ? path.resolve(process.env.DB_PATH)
  : path.join(DB_DIR, 'skillswap.db');

/**
 * Creates or wraps SQLite database instance.
 * Tries better-sqlite3 first. If native binary is unavailable (e.g. offline environment),
 * falls back to Node 22's native node:sqlite DatabaseSync with an identical synchronous interface.
 */
export async function createDatabase(filePath) {
  try {
    // Attempt standard better-sqlite3
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const db = new BetterSqlite3(filePath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    return db;
  } catch (err) {
    // Fallback to Node 22 built-in synchronous SQLite
    const { DatabaseSync } = await import('node:sqlite');
    const syncDb = new DatabaseSync(filePath);

    // Apply SQLite PRAGMAs
    syncDb.exec('PRAGMA foreign_keys = ON;');
    try {
      syncDb.exec('PRAGMA journal_mode = WAL;');
    } catch {
      // WAL fallback
    }

    let savepointDepth = 0;

    // Return compatible API wrapper matching better-sqlite3
    return {
      exec: (sql) => syncDb.exec(sql),
      prepare: (sql) => {
        const stmt = syncDb.prepare(sql);
        return {
          run: (...params) => stmt.run(...params),
          get: (...params) => stmt.get(...params),
          all: (...params) => stmt.all(...params),
        };
      },
      pragma: (str) => {
        try {
          return syncDb.exec(`PRAGMA ${str};`);
        } catch {
          return null;
        }
      },
      transaction: (fn) => {
        return (...args) => {
          const isOuter = savepointDepth === 0;
          const spName = `sp_${savepointDepth}`;
          if (isOuter) {
            syncDb.exec('BEGIN IMMEDIATE');
          } else {
            syncDb.exec(`SAVEPOINT ${spName}`);
          }
          savepointDepth++;

          try {
            const result = fn(...args);
            if (isOuter) {
              syncDb.exec('COMMIT');
            } else {
              syncDb.exec(`RELEASE SAVEPOINT ${spName}`);
            }
            return result;
          } catch (error) {
            if (isOuter) {
              syncDb.exec('ROLLBACK');
            } else {
              syncDb.exec(`ROLLBACK TO SAVEPOINT ${spName}`);
              syncDb.exec(`RELEASE SAVEPOINT ${spName}`);
            }
            throw error;
          } finally {
            savepointDepth--;
          }
        };
      },
      close: () => syncDb.close(),
    };
  }
}

/**
 * Initialize all database tables, indexes, and constraints as defined in SPEC.md Section 6
 * on any given database instance.
 */
export function initSchemaForDb(targetDb) {
  targetDb.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      handle TEXT NOT NULL UNIQUE,
      avatar_color TEXT NOT NULL,
      bio TEXT,
      experience TEXT,
      languages TEXT, -- comma-separated list
      is_online INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- User Skills table
    CREATE TABLE IF NOT EXISTS user_skills (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Availability Slots table
    CREATE TABLE IF NOT EXISTS availability_slots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL, -- 0-6 (0=Sunday)
      start_hour INTEGER NOT NULL,
      end_hour INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Bookings table
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      learner_id TEXT NOT NULL,
      mentor_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      problem_note TEXT,
      slot_label TEXT,
      status TEXT NOT NULL, -- requested | accepted | in_progress | completed | declined | cancelled
      cost INTEGER NOT NULL,
      room_id TEXT,
      requested_at TEXT NOT NULL,
      accepted_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      rating INTEGER,
      rating_comment TEXT,
      cancelled_by TEXT, -- nullable: learner | mentor
      FOREIGN KEY (learner_id) REFERENCES users(id),
      FOREIGN KEY (mentor_id) REFERENCES users(id)
    );

    -- Ledger Entries table
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      delta INTEGER NOT NULL, -- +/- integer
      kind TEXT NOT NULL, -- grant | session_spend | session_earn | bonus
      reason TEXT NOT NULL,
      booking_id TEXT, -- nullable
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    );

    -- Session Notes table
    CREATE TABLE IF NOT EXISTS session_notes (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      summary TEXT,
      final_code TEXT,
      language TEXT,
      saved_at TEXT NOT NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    );

    -- Indexes (SPEC.md Section 6)
    CREATE INDEX IF NOT EXISTS idx_user_skills_topic ON user_skills(topic);
    CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
    CREATE INDEX IF NOT EXISTS idx_ledger_entries_user_id ON ledger_entries(user_id);

    -- UNIQUE constraint preventing double settlement on ledger entries
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_booking_kind 
      ON ledger_entries(booking_id, kind) 
      WHERE booking_id IS NOT NULL;
  `);

  // Migration for cancelled_by, mentor_rating, mentor_rating_comment columns if table already existed
  try {
    targetDb.exec('ALTER TABLE bookings ADD COLUMN cancelled_by TEXT;');
  } catch {
    // Column already exists
  }
  try {
    targetDb.exec('ALTER TABLE bookings ADD COLUMN mentor_rating INTEGER;');
  } catch {
    // Column already exists
  }
  try {
    targetDb.exec('ALTER TABLE bookings ADD COLUMN mentor_rating_comment TEXT;');
  } catch {
    // Column already exists
  }
}

// Initialize default app database
export const db = await createDatabase(DB_PATH);

export function initSchema() {
  initSchemaForDb(db);
}

// Auto-initialize schema on module load
initSchema();

export default db;
