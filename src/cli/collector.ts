import { Command } from "commander";
import { cfg } from "../util/config.js";
import { runSession } from "../core/session";

const program = new Command();
program
  .name("aetheric-collector")
  .description("Collects Aetheric Engine messages into SQLite with streaming.")
  .option("--host <host>", "AE host", cfg.AE_HOST)
  .option("--port <port>", "AE port", `${cfg.AE_PORT}`)
  .option("--jwt <token>", "JWT token", cfg.AE_JWT)
  .option("--db <path>", "SQLite path", cfg.SQLITE_PATH)
  .option("--min <n>", "Minimum messages to collect", `${cfg.MIN_MESSAGES}`)
  .option("--rt <ms>", "Read timeout ms", `${cfg.READ_TIMEOUT_MS}`)
  .option("--quiet <ms>", "Max quiet drain ms", `${cfg.QUIET_MAX_MS}`)
  .option("--chunk <bytes>", "Read chunk bytes", `${cfg.CHUNK_BYTES}`)
  .option(
    "--endian <big|little>",
    "5-byte length endianness",
    cfg.LEN_ENDIANNESS
  )
  .action(async (opts) => {
    await runSession({
      host: opts.host,
      port: parseInt(opts.port, 10),
      jwt: opts.jwt,
      sqlitePath: opts.db,
      minMessages: parseInt(opts.min, 10),
      readTimeoutMs: parseInt(opts.rt, 10),
      quietMaxMs: parseInt(opts.quiet, 10),
      chunkBytes: parseInt(opts.chunk, 10),
      lenEndianness: opts.endian,
    });
  });

program.parseAsync();
