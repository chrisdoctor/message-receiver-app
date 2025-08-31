export const ASCII_START = 0x24; // '$'
export const ASCII_END = 0x3b; // ';'

export function isPrintableAscii(c: number) {
  return c >= 32 && c <= 126 && c !== ASCII_START && c !== ASCII_END;
}

export const BIN_HEADER = 0xaa; // 0xAA
