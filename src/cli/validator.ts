#!/usr/bin/env node
import Database from "better-sqlite3";
import { Command } from "commander";

const program = new Command();
program
  .name("aetheric-validator")
  .option("--db <path>", "SQLite path", "./ae.db")
  .action((opts) => {
    const db = new Database(opts.db);
    const a = db
      .prepare(
        `SELECT COUNT(*) c, MIN(payload_len) minLen, MAX(payload_len) maxLen FROM msgascii`
      )
      .get();
    const b = db
      .prepare(
        `SELECT COUNT(*) c, MIN(payload_len) minLen, MAX(payload_len) maxLen FROM msgbinary`
      )
      .get();

    const asciiBad = db
      .prepare(`SELECT COUNT(*) c FROM msgascii WHERE payload_len < 5`)
      .get() as { c: number };
    if (asciiBad.c > 0) {
      console.error(`FAIL: ${asciiBad.c} ascii rows shorter than 5 chars`);
      process.exit(2);
    }

    console.log("ASCII:", a);
    console.log("BINARY:", b);
    console.log("PASS: basic invariants OK");
  });

program.parseAsync();
