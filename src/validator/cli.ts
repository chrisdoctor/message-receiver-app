// AI-assisted

import { Command, Option } from "commander";
import "dotenv/config";
import path from "path";
import * as fs from "fs";
import { runValidation } from "./runner.js";
import { printHuman } from "./report/printer.js";
import { writeJsonReport } from "./report/json.js";
import { Mode, ShaMode } from "./report/types.js";

const program = new Command();

// Require DB path from env; do NOT allow CLI override
const ENV_DB_PATH = process.env.SQLITE_PATH;
if (!ENV_DB_PATH || ENV_DB_PATH.trim() === "") {
  console.error(
    "Error: SQLITE_PATH must be set in the .env (path to the SQLite DB)."
  );
  process.exit(1);
}

// Require report folder from env; do NOT allow CLI override
const REPORT_FOLDER = process.env.VALIDATOR_REPORT_FOLDER;
if (!REPORT_FOLDER || REPORT_FOLDER.trim() === "") {
  console.error(
    "Error: VALIDATOR_REPORT_FOLDER must be set in the .env (folder for reports)."
  );
  process.exit(1);
}

// Helper to format date as ddmmyyyy-hhmmss
function getReportFileName() {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const dd = pad(now.getDate());
  const mm = pad(now.getMonth() + 1);
  const yyyy = now.getFullYear();
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `validator-report-${dd}${mm}${yyyy}-${hh}${min}${ss}.json`;
}

program
  .name("aetheric-validator")
  .description(
    "Validates that the TCP collector parsed and stored ASCII & binary correctly"
  )
  .addOption(
    new Option("--mode <mode>").choices(["full", "fast"]).default("full")
  )
  .addOption(
    new Option("--sha <mode>").choices(["verify", "skip"]).default("verify")
  )
  .option("--sample <n>", "In fast mode, checksum this many binaries", (v) =>
    parseInt(v, 10)
  )
  .option(
    "--min <n>",
    "Expected minimum total messages",
    (v) => parseInt(v, 10),
    600
  )
  .action(async (opts) => {
    try {
      const rep = await runValidation({
        dbPath: ENV_DB_PATH,
        mode: opts.mode as Mode,
        sha: opts.sha as ShaMode,
        sample: Number.isFinite(opts.sample)
          ? (opts.sample as number)
          : undefined,
        expectedMin: Number.isFinite(opts.min)
          ? (opts.min as number)
          : undefined,
      });

      printHuman(rep);
      // Ensure report folder exists
      if (!fs.existsSync(REPORT_FOLDER)) {
        fs.mkdirSync(REPORT_FOLDER, { recursive: true });
      }
      const reportFileName = getReportFileName();
      const reportPath = path.join(REPORT_FOLDER, reportFileName);

      await writeJsonReport(reportPath, rep);
      console.log(`Report written: ${reportPath}`);
      process.exit(rep.pass ? 0 : 2);
    } catch (err: any) {
      console.error("Validator error:", err?.message ?? err);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
