import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { log } from "../utils/logger.js";
import { getBinPayloadSize } from "../utils/binPayloadSize.js";
import { ASCII_START, ASCII_END } from "../proto/ascii.js";
import { BIN_HEADER } from "../proto/binary.js";

export type AEOptions = {
  host: string;
  port: number;
  jwt: string;
  readTimeoutMs: number;
  chunkBytes: number;
  lenEndianness: "big" | "little";
};

export type AEHandlers = {
  onAscii: (payload: string) => void | Promise<void>;
  onBinaryStart: (declaredLen: number) => Promise<{ tmpPath: string }>;
  onBinaryChunk: (buf: Buffer) => Promise<void>;
  onBinaryComplete: (
    finalPath: string,
    declaredLen: number,
    checksum?: string
  ) => Promise<void>;
  onError: (err: Error) => void;
  onLog?: (msg: string) => void;
};

export class AEClient {
  private sock?: net.Socket;
  private buffer = Buffer.alloc(0);
  private asciiMode = false;
  private binaryMode = false;

  private binRemaining = 0;
  private binTmpPath = "";
  private binFd: number | null = null;
  private binHash = crypto.createHash("sha256");

  constructor(
    private opts: AEOptions,
    private h: AEHandlers
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = net.createConnection({
        host: this.opts.host,
        port: this.opts.port,
      });
      this.sock = s;

      s.setTimeout(this.opts.readTimeoutMs, () => {
        this.h.onLog?.(`read timeout ${this.opts.readTimeoutMs}ms`);
      });

      s.once("error", reject);
      s.once("connect", () => {
        this.h.onLog?.("connected");
        // AUTH
        s.write(`AUTH ${this.opts.jwt}\r\n`);
        resolve();
      });

      s.on("data", (chunk) => this.onData(chunk).catch(this.h.onError));
      s.on("close", () => this.h.onLog?.("socket closed"));
    });
  }

  private async onData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length > 0) {
      if (!this.binaryMode && !this.asciiMode) {
        // detect start
        const b0 = this.buffer[0];
        if (b0 === ASCII_START) {
          console.log("ASCII B0", b0);
          this.asciiMode = true;
          this.buffer = this.buffer.subarray(1);
          continue;
        }
        if (b0 === BIN_HEADER && this.buffer.length >= 6) {
          const len = getBinPayloadSize(this.buffer); //, 1, this.opts.lenEndianness);
          //   console.log("LEN", len);
          this.binaryMode = true;
          this.binRemaining = len;
          // prepare temp file
          const { tmpPath } = await this.h.onBinaryStart(len);
          this.binTmpPath = tmpPath;
          this.binFd = fs.openSync(this.binTmpPath, "w");
          this.buffer = this.buffer.subarray(6);
          this.h.onLog?.(`binary start: ${len} bytes`);
          continue;
        }
        // no recognizable start byte yet; drop one byte to resync
        this.buffer = this.buffer.subarray(1);
        continue;
      }

      if (this.asciiMode) {
        const endIdx = this.buffer.indexOf(ASCII_END);
        if (endIdx === -1) {
          console.log("No ascii end marker in buffer yet");
          break; // need more data
        } else {
          console.log("Ascii end marker already found in buffer");
        }
        const payloadBuf = this.buffer.subarray(0, endIdx);
        // validate printable ascii
        for (const c of payloadBuf) {
          if (!(c >= 32 && c <= 126) || c === ASCII_START || c === ASCII_END) {
            this.asciiMode = false;
            this.buffer.subarray(0, endIdx);
            console.error("Invalid ASCII payload byte", c);
            throw new Error("Invalid ASCII payload byte");
          }
        }
        const payload = payloadBuf.toString("ascii");
        if (payload.length < 5) {
          this.asciiMode = false;
          console.error("ASCII payload too short");
          throw new Error("ASCII payload too short");
        }
        await this.h.onAscii(payload);
        // consume '$payload;'
        this.buffer = this.buffer.subarray(endIdx + 1);
        this.asciiMode = false;
        continue;
      }

      if (this.binaryMode) {
        if (this.buffer.length === 0) break;
        const toWrite = Math.min(this.buffer.length, this.binRemaining);
        const chunkSlice = this.buffer.subarray(0, toWrite);

        if (this.binFd === null) throw new Error("bin fd missing");
        fs.writeSync(this.binFd, chunkSlice);
        this.binHash.update(chunkSlice);

        this.binRemaining -= toWrite;
        this.buffer = this.buffer.subarray(toWrite);

        if (this.binRemaining === 0) {
          // close file, finalize
          fs.closeSync(this.binFd);
          this.binFd = null;
          const checksum = this.binHash.digest("hex");
          this.binHash = crypto.createHash("sha256"); // reset
          // move tmp → final
          const finalPath = this.binTmpPath.replace(/\.part$/, "");
          fs.renameSync(this.binTmpPath, finalPath);
          await this.h.onBinaryComplete(finalPath, 0, checksum);
          this.binaryMode = false;
        }
        continue;
      }
    }
  }

  requestStatus() {
    this.sock?.write(`STATUS\r\n`);
  }

  end() {
    this.sock?.end();
  }
}
