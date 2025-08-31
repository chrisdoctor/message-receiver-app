/**
 * Fully AI generated: Efficient buffer manager for handling streaming data without excessive concatenation
 */
export class BufferManager {
  private bufferChunks: Buffer[] = [];
  private totalBufferSize: number = 0;

  /**
   * Add a new chunk to the buffer
   */
  addChunk(chunk: Buffer): void {
    this.bufferChunks.push(chunk);
    this.totalBufferSize += chunk.length;
  }

  /**
   * Get total size of buffered data
   */
  getTotalSize(): number {
    return this.totalBufferSize;
  }

  /**
   * Check if buffer has at least the specified number of bytes
   */
  hasBytes(count: number): boolean {
    return this.totalBufferSize >= count;
  }

  /**
   * Get a working buffer (only concatenates when necessary)
   */
  getWorkingBuffer(): Buffer {
    if (this.bufferChunks.length === 0) return Buffer.alloc(0);
    if (this.bufferChunks.length === 1) return this.bufferChunks[0];
    // Only concatenate when we actually need a contiguous buffer
    return Buffer.concat(this.bufferChunks);
  }

  /**
   * Peek at the first N bytes without consuming them
   */
  peekBytes(count: number): Buffer {
    if (this.totalBufferSize < count) {
      throw new Error(
        `Not enough bytes available. Requested: ${count}, Available: ${this.totalBufferSize}`
      );
    }

    let collected = 0;
    const result = Buffer.alloc(count);
    let resultOffset = 0;

    for (const chunk of this.bufferChunks) {
      const toCopy = Math.min(chunk.length, count - collected);
      chunk.copy(result, resultOffset, 0, toCopy);
      resultOffset += toCopy;
      collected += toCopy;
      if (collected >= count) break;
    }

    return result;
  }

  /**
   * Extract and consume the first N bytes
   */
  extractBytes(count: number): Buffer {
    const result = this.peekBytes(count);
    this.consumeBytes(count);
    return result;
  }

  /**
   * Consume (remove) the first N bytes from the buffer
   */
  consumeBytes(count: number): void {
    if (count > this.totalBufferSize) {
      throw new Error(
        `Cannot consume ${count} bytes, only ${this.totalBufferSize} available`
      );
    }

    let remaining = count;
    this.totalBufferSize -= count;

    while (remaining > 0 && this.bufferChunks.length > 0) {
      const chunk = this.bufferChunks[0];

      if (chunk.length <= remaining) {
        // Consume entire chunk
        remaining -= chunk.length;
        this.bufferChunks.shift();
      } else {
        // Partially consume chunk
        this.bufferChunks[0] = chunk.subarray(remaining);
        remaining = 0;
      }
    }
  }

  /**
   * Find the position of a specific byte in the buffer
   */
  findByteInBuffer(byte: number): number {
    let offset = 0;

    for (const chunk of this.bufferChunks) {
      const idx = chunk.indexOf(byte);
      if (idx !== -1) {
        return offset + idx;
      }
      offset += chunk.length;
    }

    return -1;
  }

  /**
   * Execute a callback for each chunk up to totalBytes, useful for direct writing
   */
  forEachChunk(
    totalBytes: number,
    callback: (chunk: Buffer, isLast: boolean) => void
  ): void {
    let remaining = totalBytes;
    let chunkIndex = 0;

    for (const chunk of this.bufferChunks) {
      if (remaining <= 0) break;

      const toProcess = Math.min(chunk.length, remaining);
      const chunkSlice =
        toProcess === chunk.length ? chunk : chunk.subarray(0, toProcess);
      const isLast = remaining <= chunk.length;

      callback(chunkSlice, isLast);

      remaining -= toProcess;
      chunkIndex++;

      if (remaining <= 0) break;
    }
  }

  /**
   * Get the first byte without consuming it
   */
  peekFirstByte(): number | null {
    if (this.totalBufferSize === 0) return null;
    return this.bufferChunks[0][0];
  }

  /**
   * Clear all buffered data
   */
  clear(): void {
    this.bufferChunks = [];
    this.totalBufferSize = 0;
  }

  /**
   * Get debug information about the buffer state
   */
  getDebugInfo(): { chunks: number; totalSize: number; chunkSizes: number[] } {
    return {
      chunks: this.bufferChunks.length,
      totalSize: this.totalBufferSize,
      chunkSizes: this.bufferChunks.map((chunk) => chunk.length),
    };
  }
}
