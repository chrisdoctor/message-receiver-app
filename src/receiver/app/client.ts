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
  onDiscard?: (
    payloadPreview: Buffer,
    payloadType: "ascii" | "binary",
    totalLen: number,
    reason: string
  ) => void | Promise<void>;
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
    // SINGLE discard check - handles all discard scenarios
    if (this.binDiscardBytes > 0) {
      const toDiscard = Math.min(chunk.length, this.binDiscardBytes);
      this.h.onLog?.(
        `Discarding ${toDiscard} bytes of binary payload; ${this.binDiscardBytes - toDiscard} remaining`
      );
      this.binDiscardBytes -= toDiscard;

      if (this.binDiscardBytes === 0) {
        this.h.onLog?.("Finished discarding oversized binary payload");
      }

      // Process remaining chunk if any
      if (toDiscard < chunk.length) {
        const remainingChunk = chunk.subarray(toDiscard);
        this.bufferManager.addChunk(chunk.subarray(toDiscard));
      }
      return;
    }

    // Add chunk to buffer manager
    this.bufferManager.addChunk(chunk);

    // Process all available data
    while (this.bufferManager.getTotalSize() > 0) {
      if (!this.binaryMode && !this.asciiMode) {
        // Detect start of message
        const firstByte = this.bufferManager.peekFirstByte();
        if (firstByte === null) break;

        if (firstByte === ASCII_START) {
          this.asciiMode = true;
          this.bufferManager.consumeBytes(1);
          this.h.onLog?.(`Ascii payload received`);
          continue;
        }

        if (firstByte === BIN_HEADER && this.bufferManager.hasBytes(6)) {
          const headerBuffer = this.bufferManager.peekBytes(6);
          const len = getBinPayloadSize(headerBuffer);

          this.h.onLog?.(
            `Binary payload to be received with size ${len} bytes`
          );

          const canPayloadFit = await canFitOnDisk(len);

          // Always consume header regardless of disk space
          this.bufferManager.consumeBytes(6);

          if (canPayloadFit === false) {
            // Simple discard mode - just set the counter
            this.h.onLog?.("Not enough disk space; discarding binary payload");
            this.binDiscardBytes = len;

            // Immediately discard any available payload data
            const availableToDiscard = Math.min(
              this.bufferManager.getTotalSize(),
              len
            );
            if (availableToDiscard > 0) {
              this.h.onDiscard?.(
                this.bufferManager.peekBytes(availableToDiscard),
                "binary",
                len,
                "Payload exceeds available disk space"
              );
              this.bufferManager.consumeBytes(availableToDiscard);
              this.binDiscardBytes -= availableToDiscard;
            }

            // Next onData calls will handle remaining discard
            continue;
          }

          this.binaryMode = true;
          this.binRemaining = len;

          try {
            const { tmpPath } = await this.h.onBinaryStart(len);
            this.binTmpPath = tmpPath;
            this.binFd = fs.openSync(this.binTmpPath, "w");
          } catch (error) {
            // If file setup fails, enter discard mode
            this.h.onLog?.("Failed to create temp file; discarding payload");
            this.binaryMode = false;
            this.binDiscardBytes = len;
            continue;
          }
          continue;
        }

        // No recognizable start byte; drop one byte to resync
        this.bufferManager.consumeBytes(1);
        continue;
      }

      if (this.asciiMode) {
        this.h.onLog?.(
          `Processing payload in ascii mode with ${this.bufferManager.getTotalSize()} bytes in buffer.`
        );
        const endIdx = this.bufferManager.findByteInBuffer(ASCII_END);
        if (endIdx === -1) {
          this.h.onLog?.(
            "No ascii end marker in buffer yet. Reading more data"
          );
          break; // Need more data
        }

        // this.h.onLog?.("Ascii end marker already found in buffer");
        const payloadBuf = this.bufferManager.extractBytes(endIdx);

        this.h.onLog?.(`Ascii payload is ${payloadBuf.length} bytes.`);

        // Validate ascii payload
        if (!this.isValidAsciiPayload(payloadBuf)) {
          this.asciiMode = false;
          this.bufferManager.consumeBytes(1); // Consume the end marker
          this.h.onLog?.("Invalid ascii payload, resetting mode");
          continue;
        }

        const payload = payloadBuf.toString("ascii");
        await this.h.onAscii(payload);
        this.asciiMode = false;
        this.bufferManager.consumeBytes(1); // Consume the end marker
        this.h.onLog?.("Ascii payload processing completed.");
        continue;
      }

      if (this.binaryMode) {
        if (this.bufferManager.getTotalSize() === 0) break;

        const toWrite = Math.min(
          this.bufferManager.getTotalSize(),
          this.binRemaining
        );

        this.h.onLog?.(
          `Processing binary data chunk with size ${toWrite} bytes`
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

          this.h.onLog?.("Processing binary data completed.");
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

  private isValidAsciiPayload(payloadBuf: Buffer): boolean {
    if (payloadBuf.length < 5) {
      this.h.onLog?.("Payload is too short; discarding payload");
      this.h.onDiscard?.(
        payloadBuf.subarray(0, 15),
        "ascii",
        payloadBuf.length,
        "Payload is too short"
      );
      return false;
    }

    for (const c of payloadBuf) {
      if (!(c >= 32 && c <= 126) || c === ASCII_START || c === ASCII_END) {
        this.h.onLog?.(`Invalid Ascii payload byte: ${c}`);
        this.h.onDiscard?.(
          payloadBuf.subarray(0, 15),
          "ascii",
          payloadBuf.length,
          `Invalid Ascii in payload: ${c}`
        );
        return false;
      }
    }
    return true;
  }

  requestStatus() {
    this.sock?.write(`STATUS\r\n`);
  }

  end() {
    this.sock?.end();
  }
}
