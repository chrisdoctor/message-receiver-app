import fs from "node:fs";
import Database from "better-sqlite3";
import { BinaryStats, Mode, ShaMode } from "../report/types.js";
import { sha256File } from "../utils/checksum.js";

type Row = {
  id: number;
  payload_path: string;
  payload_len: number;
  checksum?: string | null;
};

export async function validateBinary(
  db: Database.Database,
  mode: Mode,
  sha: ShaMode,
  sample: number | undefined
): Promise<BinaryStats> {
  const rowsIter = db
    .prepare<
      unknown[],
      Row
    >(`SELECT id, payload_path, payload_len, checksum FROM msgbinary`)
    .all();

  const totalRows = rowsIter.length;

  let filesMissing = 0;
  let sizeMismatch = 0;
  let checksumMismatch = 0;
  let minBytes: number | null = null;
  let maxBytes: number | null = null;
  let sumBytes = 0;

  // Decide which rows to checksum in fast mode
  let rowsToCheck: Row[] = rowsIter;
  if (
    mode === "fast" &&
    typeof sample === "number" &&
    sample > 0 &&
    sample < totalRows
  ) {
    const stride = Math.max(1, Math.floor(totalRows / sample));
    rowsToCheck = rowsIter
      .filter((_, idx) => idx % stride === 0)
      .slice(0, sample);
  }

  for (const row of rowsIter) {
    const { payload_path, payload_len } = row;
    try {
      const stat = fs.statSync(payload_path);
      if (stat.size !== payload_len) {
        sizeMismatch++;
      }
      minBytes = minBytes === null ? stat.size : Math.min(minBytes, stat.size);
      maxBytes = maxBytes === null ? stat.size : Math.max(maxBytes, stat.size);
      sumBytes += stat.size;
    } catch {
      filesMissing++;
      continue;
    }
  }

  // Checksums (subset in fast mode)
  if (sha === "verify" && rowsToCheck.length > 0) {
    for (const row of rowsToCheck) {
      const { payload_path, checksum } = row;
      if (!checksum) continue;
      try {
        const digest = await sha256File(payload_path);
        if (digest !== checksum) checksumMismatch++;
      } catch {
        // if file missing here, it was already counted in filesMissing; ignore
      }
    }
  }

  const avgBytes =
    totalRows - filesMissing > 0
      ? Math.round((sumBytes / (totalRows - filesMissing)) * 100) / 100
      : null;

  return {
    rows: totalRows,
    filesMissing,
    sizeMismatch,
    checksumMismatch,
    minBytes,
    maxBytes,
    avgBytes,
    sampledForChecksum: sha === "verify" ? rowsToCheck.length : 0,
  };
}
