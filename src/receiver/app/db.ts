import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type DB = Database.Database;
let db: DB;

const dataDir = path.join(process.cwd(), "data", "bin");
fs.mkdirSync(dataDir, { recursive: true });

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

    CREATE TABLE IF NOT EXISTS msgdiscarded (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload_preview BLOB NOT NULL,
      payload_type TEXT NOT NULL,
      payload_total_len INTEGER NOT NULL,
      discard_reason TEXT NOT NULL,
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

export function insertBinary(
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

export async function writeAscii(db: DB, payload: string) {
  return insertAscii(db, payload);
}

export async function createBinarySpool(declaredLen: number) {
  const name = `${Date.now()}-${Math.random().toString(36).slice(2)}-${declaredLen}.bin`;
  const tmpPath = path.join(dataDir, name + ".part");
  return { tmpPath, finalName: name };
}

export async function finalizeBinary(
  db: DB,
  finalPath: string,
  checksum: string
) {
  const stat = fs.statSync(finalPath);
  const id = insertBinary(db, finalPath, stat.size, checksum);
  return id;
}

export function insertDiscarded(
  db: DB,
  payload: Buffer,
  payloadType: "ascii" | "binary",
  totalLen: number,
  reason: string
) {
  const preview = payload.subarray(0, 15);
  const stmt = db.prepare(
    `INSERT INTO msgdiscarded (payload_preview, payload_type, payload_total_len, discard_reason) VALUES (?, ?, ?, ?)`
  );
  stmt.run(preview, payloadType, totalLen, reason);
}
