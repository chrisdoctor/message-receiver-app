export type Mode = "full" | "fast";
export type ShaMode = "verify" | "skip";

export interface AsciiStats {
  rows: number;
  invalid: number;
  minLen: number | null;
  maxLen: number | null;
  avgLen: number | null;
  examples?: { id: number; reason: string; sample?: string }[];
}

export interface BinaryStats {
  rows: number;
  filesMissing: number;
  sizeMismatch: number;
  checksumMismatch: number;
  minBytes: number | null;
  maxBytes: number | null;
  avgBytes: number | null;
  sampledForChecksum?: number; // how many rows we actually checksummed
}

export interface CrossStats {
  totalMessages: number;
  expectedMin?: number;
  meetsExpectedMin: boolean | null;
  badFramesCount?: number;
  badFramesRatio?: number | null;
}

export interface ValidatorReport {
  mode: Mode;
  sha: ShaMode;
  dbPath: string;
  dataDir?: string;
  ascii: AsciiStats;
  binary: BinaryStats;
  cross: CrossStats;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  pass: boolean;
  warnings?: string[];
}
