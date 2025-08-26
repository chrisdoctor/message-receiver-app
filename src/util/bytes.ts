export function readUint40(
  buf: Buffer,
  offset: number,
  endian: "big" | "little"
): number {
  if (endian === "big") {
    // 5 bytes big-endian → number (safe up to ~1TB)
    return (
      buf[offset] * 2 ** 32 +
      (buf[offset + 1] << 24) +
      (buf[offset + 2] << 16) +
      (buf[offset + 3] << 8) +
      buf[offset + 4]
    );
  }
  // little-endian 5 bytes
  return (
    buf[offset] +
    (buf[offset + 1] << 8) +
    (buf[offset + 2] << 16) +
    (buf[offset + 3] << 24) +
    buf[offset + 4] * 2 ** 32
  );
}
