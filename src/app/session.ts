import { AEClient } from "./client.js";
import {
  writeAscii,
  createBinarySpool,
  finalizeBinary,
} from "../storage/writers";
import { openDb, counts } from "../storage/db";
import { log } from "../utils/logger.js";

export async function runSession(opts: {
  host: string;
  port: number;
  jwt: string;
  readTimeoutMs: number;
  chunkBytes: number;
  lenEndianness: "big" | "little";
  sqlitePath: string;
  minMessages: number;
  quietMaxMs: number;
}) {
  const db = openDb(opts.sqlitePath);
  const startCounts = counts(db);
  log.info({ startCounts }, "starting session");

  let asciiCount = 0;
  let binCount = 0;

  const client = new AEClient(
    {
      host: opts.host,
      port: opts.port,
      jwt: opts.jwt,
      readTimeoutMs: opts.readTimeoutMs,
      chunkBytes: opts.chunkBytes,
      lenEndianness: opts.lenEndianness,
    },
    {
      onAscii: async (payload) => {
        await writeAscii(db, payload);
        asciiCount++;
      },
      onBinaryStart: async (declaredLen) => createBinarySpool(declaredLen),
      onBinaryChunk: async () => {}, // handled internally in client onData processing
      onBinaryComplete: async (finalPath, _declaredLen, checksum) => {
        await finalizeBinary(db, finalPath, checksum!);
        binCount++;
      },
      onError: (e) => log.error(e, "stream error"),
      onLog: (m) => log.info(m),
    }
  );

  await client.connect();

  // loop until we reach min messages; then request STATUS and drain via timeout policy
  while (true) {
    const c = counts(db);
    if (c.total >= opts.minMessages) {
      log.info(
        { reached: c.total },
        "min message target reached, requesting STATUS"
      );
      client.requestStatus();
      // drain: wait until quiet
      const start = Date.now();
      await new Promise((res) => setTimeout(res, opts.readTimeoutMs));
      if (Date.now() - start >= opts.readTimeoutMs) break;
    } else {
      await new Promise((res) => setTimeout(res, 250)); // tiny idle sleep
    }
  }

  client.end();

  const endCounts = counts(db);
  log.info({ asciiCount, binCount, endCounts }, "session finished");
}
