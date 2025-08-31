import fs from "node:fs";
import crypto from "node:crypto";

export async function sha256File(
  path: string,
  chunk = 256 * 1024
): Promise<string> {
  const hash = crypto.createHash("sha256");
  const fd = await fs.promises.open(path, "r");
  const buf = Buffer.allocUnsafe(chunk);
  try {
    let pos = 0;
    while (true) {
      const { bytesRead } = await fd.read(buf, 0, buf.length, pos);
      if (bytesRead <= 0) break;
      if (bytesRead === buf.length) {
        hash.update(buf);
      } else {
        hash.update(buf.subarray(0, bytesRead));
      }
      pos += bytesRead;
    }
  } finally {
    await fd.close();
  }
  return hash.digest("hex");
}
