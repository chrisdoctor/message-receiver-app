import net from "net";
import fs from "fs";
import crypto from "crypto";
import { getBinPayloadSize } from "../utils/binPayloadSize";
import { ASCII_START, ASCII_END, BIN_HEADER } from "./protocols.js";
import { canFitOnDisk } from "../utils/diskSpace";
import { BufferManager } from "./bufferManager";

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
  private bufferManager = new BufferManager();
  private asciiMode = false;
  private binaryMode = false;

  private binRemaining = 0;
  private binDiscardBytes = 0;
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
    // if discarding, handle immediately without buffering
    if (this.binDiscardBytes > 0) {
      const toDiscard = Math.min(chunk.length, this.binDiscardBytes);
      this.binDiscardBytes -= toDiscard;

      if (this.binDiscardBytes === 0) {
        this.h.onLog?.("Finished discarding oversized binary payload");
      }

      if (toDiscard < chunk.length) {
        const remainingChunk = chunk.subarray(toDiscard);
        return this.onData(remainingChunk);
      }
      return; // Still discarding, wait for more chunks
    }

    // Add chunk to buffer manager
    this.bufferManager.addChunk(chunk);

    // Process all available data
    while (this.bufferManager.getTotalSize() > 0) {
      if (!this.binaryMode && !this.asciiMode) {
        // Detect start
        const firstByte = this.bufferManager.peekFirstByte();
        if (firstByte === null) break;

        if (firstByte === ASCII_START) {
          this.asciiMode = true;
          this.bufferManager.consumeBytes(1);
          continue;
        }

        if (firstByte === BIN_HEADER && this.bufferManager.hasBytes(6)) {
          const headerBuffer = this.bufferManager.peekBytes(6);
          const len = getBinPayloadSize(headerBuffer);
          this.bufferManager.consumeBytes(6); // Remove header

          const canPayloadFit = await canFitOnDisk(len);
          if (canPayloadFit === false) {
            this.h.onLog?.("Not enough disk space; entering discard mode");

            // Set discard mode and immediately discard available data
            this.binDiscardBytes = len;
            const available = this.bufferManager.getTotalSize();
            const toDiscard = Math.min(available, this.binDiscardBytes);

            if (toDiscard > 0) {
              this.bufferManager.consumeBytes(toDiscard);
              this.binDiscardBytes -= toDiscard;
            }

            // Exit processing - next chunk will hit fast discard path
            return;
          }

          this.binaryMode = true;
          this.binRemaining = len;
          // Prepare temp file
          const { tmpPath } = await this.h.onBinaryStart(len);
          this.binTmpPath = tmpPath;
          this.binFd = fs.openSync(this.binTmpPath, "w");
          this.bufferManager.consumeBytes(6);
          this.h.onLog?.(`binary start: ${len} bytes`);
          continue;
        }

        // No recognizable start byte; drop one byte to resync
        this.bufferManager.consumeBytes(1);
        continue;
      }

      if (this.asciiMode) {
        const endIdx = this.bufferManager.findByteInBuffer(ASCII_END);
        if (endIdx === -1) {
          console.log("No ascii end marker in buffer yet");
          break; // Need more data
        }

        console.log("Ascii end marker already found in buffer");
        const payloadBuf = this.bufferManager.extractBytes(endIdx);

        // Validate printable ascii
        for (const c of payloadBuf) {
          if (!(c >= 32 && c <= 126) || c === ASCII_START || c === ASCII_END) {
            this.asciiMode = false;
            this.h.onLog?.(`Invalid ASCII in payload: ${c}. Discarding data`);
            continue;
          }
        }

        const payload = payloadBuf.toString("ascii");
        if (payload.length < 5) {
          this.asciiMode = false;
          this.h.onLog?.(
            `ASCII payload too short: ${payload.length} bytes. Discarding data`
          );
          continue;
        }

        await this.h.onAscii(payload);
        this.bufferManager.consumeBytes(1); // Consume the end marker
        this.asciiMode = false;
        continue;
      }

      if (this.binaryMode) {
        if (this.bufferManager.getTotalSize() === 0) break;

        const toWrite = Math.min(
          this.bufferManager.getTotalSize(),
          this.binRemaining
        );

        // Write directly from chunks without concatenating
        this.writeFromChunks(toWrite);

        this.binRemaining -= toWrite;
        this.bufferManager.consumeBytes(toWrite);

        if (this.binRemaining === 0) {
          // Close file, finalize
          if (this.binFd === null) throw new Error("bin fd missing");
          fs.closeSync(this.binFd);
          this.binFd = null;
          const checksum = this.binHash.digest("hex");
          this.binHash = crypto.createHash("sha256"); // reset
          // Move tmpfile to final
          const finalPath = this.binTmpPath.replace(/\.part$/, "");
          fs.renameSync(this.binTmpPath, finalPath);
          await this.h.onBinaryComplete(finalPath, 0, checksum);
          this.binaryMode = false;
        }
        continue;
      }
    }
  }

  private writeFromChunks(totalBytes: number): void {
    this.bufferManager.forEachChunk(totalBytes, (chunkSlice, _isLast) => {
      if (this.binFd === null) throw new Error("bin fd missing");
      fs.writeSync(this.binFd, chunkSlice);
      this.binHash.update(chunkSlice);
    });
  }

  requestStatus() {
    this.sock?.write(`STATUS\r\n`);
  }

  end() {
    this.sock?.end();
  }
}
