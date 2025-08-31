import Database from "better-sqlite3";
import { validateAscii } from "./readers/asciiReader";
import { validateBinary } from "./readers/binaryReader";
import { Mode, ShaMode, ValidatorReport, CrossStats } from "./report/types";

export async function runValidation(opts: {
  dbPath: string;
  dataDir?: string;
  mode: Mode;
  sha: ShaMode;
  sample?: number;
  expectedMin?: number;
}): Promise<ValidatorReport> {
  const started = Date.now();
  const db = new Database(opts.dbPath, { readonly: true });

  // Basic schema presence checks (throws if missing)
  ensureTables(db);

  const ascii = validateAscii(db);
  const binary = await validateBinary(db, opts.mode, opts.sha, opts.sample);

  const totalMessages = ascii.rows + binary.rows;
  const badFramesInfo = readBadFramesInfo(db, totalMessages);

  const cross: CrossStats = {
    totalMessages,
    expectedMin: opts.expectedMin,
    meetsExpectedMin:
      typeof opts.expectedMin === "number"
        ? totalMessages >= opts.expectedMin
        : null,
    badFramesCount: badFramesInfo?.count,
    badFramesRatio: badFramesInfo?.ratio ?? null,
  };

  const pass =
    ascii.invalid === 0 &&
    binary.filesMissing === 0 &&
    binary.sizeMismatch === 0 &&
    binary.checksumMismatch === 0 &&
    (cross.meetsExpectedMin ?? true);

  const finished = Date.now();

  return {
    mode: opts.mode,
    sha: opts.sha,
    dbPath: opts.dbPath,
    dataDir: opts.dataDir,
    ascii,
    binary,
    cross,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - started,
    pass,
    warnings: [],
  };
}

function ensureTables(db: Database.Database) {
  const haveAscii = hasTable(db, "msgascii");
  const haveBinary = hasTable(db, "msgbinary");
  if (!haveAscii || !haveBinary) {
    const missing = [
      !haveAscii ? "msgascii" : null,
      !haveBinary ? "msgbinary" : null,
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(`Missing required tables: ${missing}`);
  }
}

function hasTable(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name) as { name?: string } | undefined;
  return !!row?.name;
}

function readBadFramesInfo(
  db: Database.Database,
  totalMessages: number
): { count: number; ratio: number } | null {
  if (!hasTable(db, "bad_frames")) return null;
  const row = db.prepare("SELECT COUNT(*) as c FROM bad_frames").get() as {
    c: number;
  };
  const count = row.c || 0;
  const ratio = totalMessages + count > 0 ? count / (totalMessages + count) : 0;
  return { count, ratio };
}
