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
  // db.exec(`
  //   DROP TABLE IF EXISTS msgascii;
  //   DROP TABLE IF EXISTS msgbinary;
  // `);

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

export function insertAscii(db: DB, payload: string) {
  const stmt = db.prepare(
    `INSERT INTO msgascii (payload, payload_len) VALUES (?, ?)`
  );
  const info = stmt.run(payload, payload.length);
  return info.lastInsertRowid as number;
}

export function insertBinaryMeta(
  db: DB,
  payloadPath: string,
  len: number,
  checksum?: string
) {
  const stmt = db.prepare(
    `INSERT INTO msgbinary (payload_path, payload_len, checksum) VALUES (?, ?, ?)`
  );
  const info = stmt.run(payloadPath, len, checksum ?? null);
  return info.lastInsertRowid as number;
}

export function counts(db: DB) {
  const ascii = db.prepare(`SELECT COUNT(*) c FROM msgascii`).get() as {
    c: number;
  };
  const bin = db.prepare(`SELECT COUNT(*) c FROM msgbinary`).get() as {
    c: number;
  };
  return { ascii: ascii.c, binary: bin.c, total: ascii.c + bin.c };
}
