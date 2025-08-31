import Database from "better-sqlite3";
import { AsciiStats } from "../report/types.js";

function isPrintableAsciiCode(n: number): boolean {
  return n >= 0x20 && n <= 0x7e && n !== 0x24 /* $ */ && n !== 0x3b /* ; */;
}

// AI-assisted
export function validateAscii(db: Database.Database): AsciiStats {
  const q = db.prepare<
    unknown[],
    { id: number; payload: string; payload_len: number }
  >(`SELECT id, payload, payload_len FROM msgascii`);

  let rows = 0;
  let invalid = 0;
  let minLen: number | null = null;
  let maxLen: number | null = null;
  let sumLen = 0;

  const examples: { id: number; reason: string; sample?: string }[] = [];

  for (const row of q.iterate()) {
    rows++;
    const { id, payload, payload_len } = row;

    const actualLen = payload.length;
    let badReason: string | null = null;

    if (actualLen !== payload_len) badReason = "len_mismatch";
    else if (actualLen < 5) badReason = "too_short";
    else {
      const buf = Buffer.from(payload, "ascii");
      for (const c of buf) {
        if (!isPrintableAsciiCode(c)) {
          badReason = "non_printable_or_marker";
          break;
        }
      }
    }

    if (badReason) {
      invalid++;
      if (examples.length < 5) {
        examples.push({ id, reason: badReason, sample: payload.slice(0, 32) });
      }
      continue;
    }

    // valid row stats
    minLen = minLen === null ? actualLen : Math.min(minLen, actualLen);
    maxLen = maxLen === null ? actualLen : Math.max(maxLen, actualLen);
    sumLen += actualLen;
  }

  const avgLen =
    rows - invalid > 0
      ? Math.round((sumLen / (rows - invalid)) * 100) / 100
      : null;

  return { rows, invalid, minLen, maxLen, avgLen, examples };
}
