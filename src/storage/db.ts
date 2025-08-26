import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type DB = Database.Database;
let db: DB;

export function openDb(filename: string): DB {
  db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  applyMigrations(db);
  return db;
}

function applyMigrations(db: DB) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS msgascii (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT NOT NULL,
      payload_len INTEGER NOT NULL,
      inserted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS msgbinary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload_path TEXT NOT NULL,
      payload_len INTEGER NOT NULL,
      checksum TEXT,
      inserted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const spool = path.join(process.cwd(), "tmp", "spool");
  fs.mkdirSync(spool, { recursive: true });
}
