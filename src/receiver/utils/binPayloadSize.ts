// AI-assisted code
export function getBinPayloadSize(buffer: Buffer): number {
  // Read 5 bytes starting at offset 1
  const offset = 1;

  // Ensure buffer has enough bytes
  if (buffer.length < offset + 5) {
    throw new Error(
      `Buffer too short: expected at least ${offset + 5} bytes, got ${buffer.length}`
    );
  }

  // Read the 5 bytes and convert to decimal
  // Using big-endian byte order
  let result = 0;

  for (let i = 0; i < 5; i++) {
    if (buffer[offset + i] !== 0) {
      result = result * 256 + buffer[offset + i];
    }
  }

  return result;
}
