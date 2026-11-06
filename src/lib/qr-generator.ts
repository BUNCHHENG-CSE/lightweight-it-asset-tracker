/**
 * Zero-dependency pure-TypeScript Barcode (Code 39) & QR Code SVG Generator.
 * Used for physical IT asset tagging, mobile scanning audits, and printable labels.
 */

// ============================================================================
// 1. Code 39 1D Barcode Generator
// Standard for warehouse, logistics, and IT asset tags (e.g. "AST-2024-001")
// ============================================================================

const CODE_39_PATTERNS: Record<string, string> = {
  "0": "101001101101",
  "1": "110100101011",
  "2": "101100101011",
  "3": "110110010101",
  "4": "101001101011",
  "5": "110100110101",
  "6": "101100110101",
  "7": "101001011011",
  "8": "110100101101",
  "9": "101100101101",
  A: "110101001011",
  B: "101101001011",
  C: "110110100101",
  D: "101011001011",
  E: "110101100101",
  F: "101101100101",
  G: "101010011011",
  H: "110101001101",
  I: "101101001101",
  J: "101011001101",
  K: "110101010011",
  L: "101101010011",
  M: "110110101001",
  N: "101011010011",
  O: "110101101001",
  P: "101101101001",
  Q: "101010110011",
  R: "110101011001",
  S: "101101011001",
  T: "101011011001",
  U: "110010101011",
  V: "100110101011",
  W: "110011010101",
  X: "100101101011",
  Y: "110010110101",
  Z: "100110110101",
  "-": "100101011011",
  ".": "110010101101",
  " ": "100110101101",
  $: "100100100101",
  "/": "100100101001",
  "+": "100101001001",
  "%": "101001001001",
  "*": "100101101101", // Start / Stop delimiter
};

export function generateBarcodeBits(rawText: string): string {
  const clean = rawText.toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, "-");
  const full = `*${clean}*`;
  let bits = "";
  for (let i = 0; i < full.length; i++) {
    const char = full[i];
    const pattern = CODE_39_PATTERNS[char] || CODE_39_PATTERNS["-"];
    bits += pattern + "0"; // inter-character gap
  }
  return bits;
}

export function generateBarcodeSvg(
  text: string,
  options: {
    height?: number;
    barWidth?: number;
    showText?: boolean;
    color?: string;
  } = {}
): string {
  const {
    height = 42,
    barWidth = 1.7,
    showText = true,
    color = "currentColor",
  } = options;

  const bits = generateBarcodeBits(text);
  const totalWidth = bits.length * barWidth;
  const totalHeight = height + (showText ? 14 : 0);

  let rects = "";
  let currentRunStart = -1;

  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === "1") {
      if (currentRunStart === -1) currentRunStart = i;
    } else {
      if (currentRunStart !== -1) {
        const x = currentRunStart * barWidth;
        const w = (i - currentRunStart) * barWidth;
        rects += `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(
          1
        )}" height="${height}" fill="${color}" />`;
        currentRunStart = -1;
      }
    }
  }

  if (currentRunStart !== -1) {
    const x = currentRunStart * barWidth;
    const w = (bits.length - currentRunStart) * barWidth;
    rects += `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(
      1
    )}" height="${height}" fill="${color}" />`;
  }

  const textElement = showText
    ? `<text x="${(totalWidth / 2).toFixed(
        1
      )}" y="${(height + 12).toFixed(
        1
      )}" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="${color}" letter-spacing="1.5">${text}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth.toFixed(
    1
  )} ${totalHeight}" width="100%" height="${totalHeight}" style="display:block;max-width:100%">${rects}${textElement}</svg>`;
}

// ============================================================================
// 2. Pure TypeScript QR Code Generator (ISO/IEC 18004 Standard Minimal Engine)
// Generates scannable QR Code matrices for Asset URLs, JSON, or Asset Tags.
// ============================================================================

// Galois Field GF(256) tables with primitive polynomial 0x11d
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsCompute(data: number[], numEcBytes: number): number[] {
  // Generator polynomial for numEcBytes
  const genPoly = [1];
  for (let i = 0; i < numEcBytes; i++) {
    const root = GF_EXP[i];
    const nextPoly = new Array(genPoly.length + 1).fill(0);
    for (let j = 0; j < genPoly.length; j++) {
      nextPoly[j] ^= gfMultiply(genPoly[j], root);
      nextPoly[j + 1] ^= genPoly[j];
    }
    for (let j = 0; j < nextPoly.length; j++) {
      genPoly[j] = nextPoly[j];
    }
  }

  const remainder = new Array(numEcBytes).fill(0);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    if (factor !== 0) {
      for (let j = 0; j < numEcBytes; j++) {
        remainder[j] ^= gfMultiply(genPoly[j], factor);
      }
    }
  }
  return remainder;
}

// QR Code Specifications for Version 1 through Version 4 (Low EC Level)
interface QrVersionSpec {
  version: number;
  size: number;
  totalDataBytes: number;
  ecBytes: number;
  alignmentPatterns: number[];
}

const QR_SPECS: QrVersionSpec[] = [
  { version: 1, size: 21, totalDataBytes: 19, ecBytes: 7, alignmentPatterns: [] },
  { version: 2, size: 25, totalDataBytes: 34, ecBytes: 10, alignmentPatterns: [6, 18] },
  { version: 3, size: 29, totalDataBytes: 55, ecBytes: 15, alignmentPatterns: [6, 22] },
  { version: 4, size: 33, totalDataBytes: 80, ecBytes: 20, alignmentPatterns: [6, 26] },
];

export function createQrMatrix(text: string): boolean[][] {
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(text);

  // Pick smallest fitting version
  let chosenSpec = QR_SPECS[0];
  for (const s of QR_SPECS) {
    // Mode byte (4 bits) + character count (8 bits) = 1.5 bytes + rawBytes <= totalDataBytes
    if (rawBytes.length + 2 <= s.totalDataBytes) {
      chosenSpec = s;
      break;
    }
    chosenSpec = s;
  }

  const { size, totalDataBytes, ecBytes, alignmentPatterns } = chosenSpec;

  // Build data bit stream (Byte Mode: 0100 + 8-bit length + bytes + 0000 terminator)
  const bitStream: number[] = [];
  function pushBits(val: number, len: number) {
    for (let b = len - 1; b >= 0; b--) {
      bitStream.push((val >> b) & 1);
    }
  }

  pushBits(0b0100, 4); // Byte mode
  pushBits(rawBytes.length, 8); // Count
  for (let i = 0; i < rawBytes.length; i++) {
    pushBits(rawBytes[i], 8);
  }

  // 4-bit terminator
  const maxBits = totalDataBytes * 8;
  const padLen = Math.min(4, maxBits - bitStream.length);
  pushBits(0, padLen);

  // Pad to byte boundary
  while (bitStream.length % 8 !== 0) bitStream.push(0);

  // Pad bytes 0xEC, 0x11
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bitStream.length < maxBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Convert bits to data byte array
  const dataBytes: number[] = [];
  for (let i = 0; i < bitStream.length; i += 8) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bitStream[i + b];
    }
    dataBytes.push(byteVal);
  }

  // Compute Reed-Solomon Error Correction
  const ecValues = rsCompute(dataBytes, ecBytes);
  const finalCodewords = [...dataBytes, ...ecValues];

  // Initialize Matrix: true = black, false = white
  const matrix: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false)
  );
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false)
  );

  function setModule(r: number, c: number, val: boolean) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val;
      reserved[r][c] = true;
    }
  }

  // Finder Patterns (7x7) at 3 corners
  function placeFinder(top: number, left: number) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setModule(top + r, left + c, isBorder || isCenter);
      }
    }
    // Separators around finders
    for (let i = 0; i < 8; i++) {
      setModule(top + 7, left + i, false);
      setModule(top + i, left + 7, false);
      setModule(top - 1, left + i, false);
      setModule(top + i, left - 1, false);
    }
  }

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0;
    if (!reserved[6][i]) setModule(6, i, val);
    if (!reserved[i][6]) setModule(i, 6, val);
  }

  // Alignment patterns (for v2+)
  if (alignmentPatterns.length > 0) {
    for (const r of alignmentPatterns) {
      for (const c of alignmentPatterns) {
        if (reserved[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isCenter = dr === 0 && dc === 0;
            setModule(r + dr, c + dc, isBorder || isCenter);
          }
        }
      }
    }
  }

  // Dark module
  setModule(size - 8, 8, true);

  function markReserved(r: number, c: number) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      reserved[r][c] = true;
    }
  }

  // Reserve format information area
  for (let i = 0; i < 9; i++) {
    markReserved(8, i);
    markReserved(i, 8);
  }
  for (let i = 0; i < 8; i++) {
    markReserved(8, size - 1 - i);
    markReserved(size - 1 - i, 8);
  }

  // Place Codewords into remaining modules (2 columns at a time, zig-zag)
  let bitIdx = 0;
  const allBits: number[] = [];
  for (const cw of finalCodewords) {
    for (let b = 7; b >= 0; b--) {
      allBits.push((cw >> b) & 1);
    }
  }

  let upward = true;
  for (let c = size - 1; c > 0; c -= 2) {
    if (c === 6) c--; // Skip vertical timing column
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const colOffset of [0, 1]) {
        const curCol = c - colOffset;
        if (!reserved[r][curCol]) {
          const bitVal = bitIdx < allBits.length ? allBits[bitIdx] : 0;
          bitIdx++;

          // Apply standard Mask 0: (row + col) % 2 === 0
          const mask = (r + curCol) % 2 === 0;
          matrix[r][curCol] = (bitVal === 1) !== mask;
        }
      }
    }
    upward = !upward;
  }

  // Format info for Mask 0 + EC Level L (0b01) -> Formatted 15-bit codeword: 111011111000100
  const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
  // Write format info around top-left finder
  for (let i = 0; i < 6; i++) matrix[8][i] = formatBits[i] === 1;
  matrix[8][7] = formatBits[6] === 1;
  matrix[8][8] = formatBits[7] === 1;
  matrix[7][8] = formatBits[8] === 1;
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = formatBits[i] === 1;

  // Write format info at bottom-left and top-right
  for (let i = 0; i < 7; i++) matrix[size - 1 - i][8] = formatBits[i] === 1;
  for (let i = 0; i < 8; i++) matrix[8][size - 8 + i] = formatBits[7 + i] === 1;

  // Clean remaining nulls to false
  return matrix.map((row) => row.map((cell) => cell ?? false));
}

export function generateQrCodeSvg(
  text: string,
  options: {
    size?: number;
    color?: string;
    bgColor?: string;
    quietZone?: number;
  } = {}
): string {
  const {
    size = 140,
    color = "#0f172a",
    bgColor = "#ffffff",
    quietZone = 3,
  } = options;

  const matrix = createQrMatrix(text);
  const matrixSize = matrix.length;
  const totalDim = matrixSize + quietZone * 2;
  const cellSize = 1;

  let paths = "";
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (matrix[r][c]) {
        const x = (c + quietZone) * cellSize;
        const y = (r + quietZone) * cellSize;
        paths += `M${x},${y}h1v1h-1z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalDim} ${totalDim}" width="${size}" height="${size}" shape-rendering="crispEdges">
    <rect width="${totalDim}" height="${totalDim}" fill="${bgColor}" />
    <path d="${paths}" fill="${color}" />
  </svg>`;
}
