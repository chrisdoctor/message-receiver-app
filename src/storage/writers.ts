import fs from "node:fs";
import path from "node:path";
import { insertAscii, insertBinaryMeta, type DB } from "./db";

const dataDir = path.join(process.cwd(), "data", "bin");
fs.mkdirSync(dataDir, { recursive: true });

export async function writeAscii(db: DB, payload: string) {
  return insertAscii(db, payload);
}

export async function createBinarySpool(declaredLen: number) {
  const name = `${Date.now()}-${Math.random().toString(36).slice(2)}-${declaredLen}.bin`;
  const tmpPath = path.join(dataDir, name + ".part");
  return { tmpPath, finalName: name };
}

export async function finalizeBinary(
  db: DB,
  finalPath: string,
  checksum: string
) {
  const stat = fs.statSync(finalPath);
  const id = insertBinaryMeta(db, finalPath, stat.size, checksum);
  return id;
}
