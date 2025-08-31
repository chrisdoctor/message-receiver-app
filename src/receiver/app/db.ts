import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export type DB = Database.Database;
let db: DB;

// const dataDir = path.join(process.cwd(), "data", "bin");
// fs.mkdirSync(dataDir, { recursive: true });

// Use BINARY_SPOOL_DIR from env, default to "<project-root>/data/bin"
const dataDir =
  process.env.BINARY_SPOOL_DIR && process.env.BINARY_SPOOL_DIR.trim() !== ""
    ? path.resolve(process.env.BINARY_SPOOL_DIR)
    : path.resolve(process.cwd(), "data", "bin");
fs.mkdirSync(dataDir, { recursive: true });

export function openDb(filename: string): DB {
  const dbDir = path.dirname(process.env.SQLITE_PATH || "./sqlite-db/ae.db");
  fs.mkdirSync(dbDir, { recursive: true });

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
  //   DROP TABLE IF EXISTS msgdiscarded;
  // `);

  //AI-assisted code generation
  db.exec(`
    CREATE TABLE IF NOT EXISTS msgascii (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT NOT NULL,
      payload_len INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      inserted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS msgbinary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload_path TEXT NOT NULL,
      payload_len INTEGER NOT NULL,
      checksum TEXT,
      session_id TEXT NOT NULL,
      inserted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS msgdiscarded (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload_preview BLOB NOT NULL,
      payload_type TEXT NOT NULL,
      payload_total_len INTEGER NOT NULL,
      discard_reason TEXT NOT NULL,
      session_id TEXT NOT NULL,
      inserted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function insertAscii(db: DB, sessionId: string, payload: string) {
  const stmt = db.prepare(
    `INSERT INTO msgascii (payload, payload_len, session_id) VALUES (?, ?, ?)`
  );
  const info = stmt.run(payload, payload.length, sessionId);
  return info.lastInsertRowid as number;
}

export function insertBinary(
  db: DB,
  sessionId: string,
  payloadPath: string,
  len: number,
  checksum?: string
) {
  const stmt = db.prepare(
    `INSERT INTO msgbinary (payload_path, payload_len, checksum, session_id) VALUES (?, ?, ?, ?)`
  );
  const info = stmt.run(payloadPath, len, checksum ?? null, sessionId);
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

export async function writeAscii(db: DB, sessionId: string, payload: string) {
  return insertAscii(db, sessionId, payload);
}

export async function createBinarySpool(declaredLen: number) {
  const name = `${Date.now()}-${Math.random().toString(36).slice(2)}-${declaredLen}.bin`;
  const tmpPath = path.join(dataDir, name + ".part");
  return { tmpPath, finalName: name };
}

export async function finalizeBinary(
  db: DB,
  sessionId: string,
  finalPath: string,
  checksum: string
) {
  const stat = fs.statSync(finalPath);
  const id = insertBinary(db, sessionId, finalPath, stat.size, checksum);
  return id;
}

export function insertDiscarded(
  db: DB,
  sessionId: string,
  payload: Buffer,
  payloadType: "ascii" | "binary",
  totalLen: number,
  reason: string
) {
  const preview = payload.subarray(0, 15);
  const stmt = db.prepare(
    `INSERT INTO msgdiscarded (payload_preview, payload_type, payload_total_len, discard_reason, session_id) VALUES (?, ?, ?, ?, ?)`
  );
  stmt.run(preview, payloadType, totalLen, reason, sessionId);
}
