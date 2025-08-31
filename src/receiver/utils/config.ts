import "dotenv/config";
import { z } from "zod";

// AI-assisted code generation
const schema = z.object({
  AE_HOST: z.string().default("127.0.0.1"),
  AE_PORT: z.coerce.number().int().min(1).max(65535).default(9000),
  AE_JWT: z.string().min(10, "AE_JWT required"),
  SQLITE_PATH: z.string().default("./sqlite-db/ae.db"),
  MIN_MESSAGES: z.coerce.number().int().min(1).default(600),
  READ_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
  // QUIET_MAX_MS: z.coerce.number().int().min(1000).default(60000),
  // CHUNK_BYTES: z.coerce.number().int().min(4096).default(131072),
  // LEN_ENDIANNESS: z.enum(["big", "little"]).default("big"),
});

export type AppConfig = z.infer<typeof schema>;
export const cfg: AppConfig = schema.parse(process.env);
