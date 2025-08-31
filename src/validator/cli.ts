#!/usr/bin/env node
import { Command, Option } from "commander";
import "dotenv/config";
import { runValidation } from "./runner";
import { printHuman } from "./report/printer";
import { writeJsonReport } from "./report/json";
import { Mode, ShaMode } from "./report/types";

const program = new Command();

// Require DB path from env; do NOT allow CLI override
const ENV_DB_PATH = process.env.SQLITE_PATH;
if (!ENV_DB_PATH || ENV_DB_PATH.trim() === "") {
  console.error(
    "Error: SQLITE_PATH must be set in the .env (path to the SQLite DB)."
  );
  process.exit(1);
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
  .option(
    "--json-out <path>",
    "Write JSON report to file",
    "./validator-report.json"
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
      if (opts.jsonOut) {
        await writeJsonReport(opts.jsonOut, rep);
        console.log(`Report written: ${opts.jsonOut}`);
      }
      process.exit(rep.pass ? 0 : 2);
    } catch (err: any) {
      console.error("Validator error:", err?.message ?? err);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
