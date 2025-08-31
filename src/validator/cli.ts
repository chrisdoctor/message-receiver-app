#!/usr/bin/env node
import { Command, Option } from "commander";
import { runValidation } from "./runner";
import { printHuman } from "./report/printer";
import { writeJsonReport } from "./report/json";
import { Mode, ShaMode } from "./report/types";

const program = new Command();
program
  .name("aetheric-validator")
  .description(
    "Validates that the TCP collector parsed and stored ASCII & binary correctly"
  )
  .option("--db <path>", "SQLite DB path", "./ae.db")
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
        dbPath: opts.db as string,
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
