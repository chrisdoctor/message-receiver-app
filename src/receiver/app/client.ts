import net from "net";
import fs from "fs";
import crypto from "crypto";
import { getBinPayloadSize } from "../utils/binPayloadSize.js";
import {
  ASCII_START,
  ASCII_END,
  BIN_HEADER,
  isPrintableAscii,
} from "./protocols.js";
import { canFitOnDisk } from "../utils/diskSpace.js";
import { BufferManager } from "./bufferManager.js";

export type AEOptions = {
  host: string;
  port: number;
  jwt: string;
  readTimeoutMs: number;
  // chunkBytes: number;
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

  private processing = false;
  private chunkQueue: Buffer[] = [];

  constructor(
    private opts: AEOptions,
    private h: AEHandlers
  ) {}

  // AI-Assisted code generation
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = net.createConnection({
        host: this.opts.host,
        port: this.opts.port,
      });
      this.sock = s;

      s.setTimeout(this.opts.readTimeoutMs, () => {
        this.h.onLog?.(`read timeout ${this.opts.readTimeoutMs}ms`);
        s.end();
      });

      s.once("error", reject);
      s.once("connect", () => {
        this.h.onLog?.("connected");
        s.write(`AUTH ${this.opts.jwt}\r\n`);
        resolve();
      });

      s.on("data", (chunk) => this.onData(chunk).catch(this.h.onError));
      s.on("close", () => this.h.onLog?.("socket closed"));
    });
  }

  private async onData(chunk: Buffer) {
    this.chunkQueue.push(chunk);
    if (this.processing) return;
    this.processing = true;

    while (this.chunkQueue.length > 0) {
      const nextChunk = this.chunkQueue.shift()!;
      await this._processData(nextChunk);
    }

    this.processing = false;
  }

  // AI-Assisted code generation
  private async _processData(chunk: Buffer) {
    // Handle discards first
    if (this.binDiscardBytes > 0) {
      this.handleDiscardBytes(chunk);
      return;
    }

    this.bufferManager.addChunk(chunk);

    while (this.bufferManager.getTotalSize() > 0) {
      if (!this.binaryMode && !this.asciiMode) {
        if (this.detectAsciiStart()) continue;
        if (await this.detectBinaryStart()) continue;
        // No recognizable start byte; drop one byte to resync
        this.bufferManager.consumeBytes(1);
        continue;
      }

      if (this.asciiMode) {
        if (await this.processAsciiMode()) continue;
        break;
      }

      if (this.binaryMode) {
        if (await this.processBinaryMode()) continue;
        break;
      }
    }
  }

  // --- Mode Detection and Processing ---

  private detectAsciiStart(): boolean {
    const firstByte = this.bufferManager.peekFirstByte();
    if (firstByte === ASCII_START) {
      this.asciiMode = true;
      this.bufferManager.consumeBytes(1);
      this.h.onLog?.(`Ascii payload received`);
      return true;
    }
    return false;
  }

  private async detectBinaryStart(): Promise<boolean> {
    const firstByte = this.bufferManager.peekFirstByte();
    if (firstByte === BIN_HEADER && this.bufferManager.hasBytes(6)) {
      const headerBuffer = this.bufferManager.peekBytes(6);
      const len = getBinPayloadSize(headerBuffer);

      this.h.onLog?.(`Binary payload to be received with size ${len} bytes.`);

      const canPayloadFit = await canFitOnDisk(len);

      // Always consume header regardless of disk space
      this.bufferManager.consumeBytes(6);

      if (!canPayloadFit) {
        this.handleBinaryDiscard(len, "Payload exceeds available disk space");
        return true;
      }

      this.binaryMode = true;
      this.binRemaining = len;

      try {
        const { tmpPath } = await this.h.onBinaryStart(len);
        this.binTmpPath = tmpPath;
        this.binFd = fs.openSync(this.binTmpPath, "w");
      } catch (error) {
        this.h.onLog?.("Failed to create temp file; discarding payload");
        this.binaryMode = false;
        this.binDiscardBytes = len;
      }
      return true;
    }
    return false;
  }

  private async processAsciiMode(): Promise<boolean> {
    this.h.onLog?.(
      `Processing payload in ascii mode with ${this.bufferManager.getTotalSize()} bytes in buffer.`
    );
    const endIdx = this.bufferManager.findByteInBuffer(ASCII_END);
    if (endIdx === -1) {
      this.h.onLog?.("No ascii end marker in buffer yet. Reading more data");
      return false; // Need more data
    }

    const payloadBuf = this.bufferManager.extractBytes(endIdx);

    this.h.onLog?.(`Ascii payload is ${payloadBuf.length} bytes.`);

    if (!this.isValidAsciiPayload(payloadBuf)) {
      this.asciiMode = false;
      this.bufferManager.consumeBytes(1); // Consume the end marker
      this.h.onLog?.("Discarded ascii payload.");
      return true;
    }

    const payload = payloadBuf.toString("ascii");
    await this.h.onAscii(payload);
    this.asciiMode = false;
    this.bufferManager.consumeBytes(1); // Consume the end marker
    this.h.onLog?.("Ascii payload processing completed.");
    return true;
  }

  private async processBinaryMode(): Promise<boolean> {
    if (this.bufferManager.getTotalSize() === 0) return false;

    const toWrite = Math.min(
      this.bufferManager.getTotalSize(),
      this.binRemaining
    );

    this.writeFromChunks(toWrite);

    this.binRemaining -= toWrite;
    this.bufferManager.consumeBytes(toWrite);

    if (this.binRemaining === 0) {
      await this.finalizeBinaryPayload();
      return true;
    }
    return true;
  }

  // --- Discard Handling ---

  private handleDiscardBytes(chunk: Buffer) {
    const toDiscard = Math.min(chunk.length, this.binDiscardBytes);
    this.binDiscardBytes -= toDiscard;

    if (this.binDiscardBytes === 0) {
      this.h.onLog?.("Finished discarding oversized binary payload");
    }

    if (toDiscard < chunk.length) {
      this.bufferManager.addChunk(chunk.subarray(toDiscard));
    }
  }

  private handleBinaryDiscard(len: number, reason: string) {
    this.h.onLog?.("Not enough disk space; discarding binary payload");
    this.binDiscardBytes = len;
    this.deleteBinFile(this.binTmpPath);
    this.binTmpPath = "";

    const availableToDiscard = Math.min(this.bufferManager.getTotalSize(), len);
    if (availableToDiscard > 0) {
      this.h.onDiscard?.(
        this.bufferManager.peekBytes(availableToDiscard),
        "binary",
        len,
        reason
      );
      this.bufferManager.consumeBytes(availableToDiscard);
      this.binDiscardBytes -= availableToDiscard;
    }
  }

  // --- Binary Payload Finalization ---

  private async finalizeBinaryPayload() {
    if (this.binFd === null) throw new Error("bin fd missing");
    fs.closeSync(this.binFd);
    this.binFd = null;
    const checksum = this.binHash.digest("hex");
    this.binHash = crypto.createHash("sha256"); // reset
    const finalPath = this.binTmpPath.replace(/\.part$/, "");
    fs.renameSync(this.binTmpPath, finalPath);
    await this.h.onBinaryComplete(finalPath, 0, checksum);
    this.binaryMode = false;
    this.h.onLog?.("Processing binary data completed.");
  }

  // --- File and Payload Utilities ---

  private writeFromChunks(totalBytes: number): void {
    this.bufferManager.forEachChunk(totalBytes, (chunkSlice, _isLast) => {
      if (this.binFd === null) throw new Error("bin fd missing");
      fs.writeSync(this.binFd, chunkSlice);
      this.binHash.update(chunkSlice);
    });
  }

  private deleteBinFile(tmpFile: string): void {
    const fileToDelete = tmpFile.replace(/\.part$/, "");
    if (fileToDelete && fs.existsSync(fileToDelete)) {
      try {
        fs.unlinkSync(fileToDelete);
        this.h.onLog?.(`Deleted temporary binary spool file: ${fileToDelete}`);
      } catch (err) {
        this.h.onLog?.(
          `Failed to delete temporary binary spool file: ${fileToDelete}: ${err}`
        );
      }
    }
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
      if (!isPrintableAscii(c)) {
        this.h.onLog?.(`Invalid ascii payload byte: ${c}`);
        this.h.onDiscard?.(
          payloadBuf.subarray(0, 15),
          "ascii",
          payloadBuf.length,
          `Invalid ascii in payload: ${c}`
        );
        return false;
      }
    }
    return true;
  }

  // --- Public API ---

  requestStatus() {
    this.sock?.write(`STATUS\r\n`);
  }

  end() {
    this.sock?.end();
  }
}
