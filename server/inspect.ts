import opentype from 'opentype.js';
import { CHARSET } from '../src/spec';

const SIGNATURES = new Set([0x00010000, 0x74727565, 0x4f54544f]);

function hasInk(path: opentype.Path): boolean {
  let x = 0, y = 0, startX = 0, startY = 0, area = 0;
  const line = (nx: number, ny: number) => { area += x * ny - nx * y; x = nx; y = ny; };
  for (const cmd of path.commands) {
    if (Object.values(cmd).some((value) => typeof value === 'number' && !Number.isFinite(value))) return false;
    if (cmd.type === 'M') { line(startX, startY); x = startX = cmd.x; y = startY = cmd.y; }
    else if (cmd.type === 'L') line(cmd.x, cmd.y);
    else if (cmd.type === 'Z') line(startX, startY);
    else if (cmd.type === 'Q' || cmd.type === 'C') {
      const sx = x, sy = y;
      for (let i = 1; i <= 12; i++) {
        const t = i / 12, u = 1 - t;
        if (cmd.type === 'Q') line(u*u*sx + 2*u*t*cmd.x1 + t*t*cmd.x, u*u*sy + 2*u*t*cmd.y1 + t*t*cmd.y);
        else line(u*u*u*sx + 3*u*u*t*cmd.x1 + 3*u*t*t*cmd.x2 + t*t*t*cmd.x,
          u*u*u*sy + 3*u*u*t*cmd.y1 + 3*u*t*t*cmd.y2 + t*t*t*cmd.y);
      }
    }
  }
  line(startX, startY);
  return Math.abs(area) > 0.01;
}

/** Counts only supported characters mapped to a real outline with nonzero filled area. */
export function inspectFont(bytes: Uint8Array) {
  if (bytes.byteLength < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!SIGNATURES.has(view.getUint32(0))) return null;
  try {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const font = opentype.parse(buffer);
    const covered = CHARSET.filter((char) => font.charToGlyphIndex(char) !== 0 && hasInk(font.charToGlyph(char).path));
    return covered.length ? { glyphCount: covered.length, covered, missing: CHARSET.filter((char) => !covered.includes(char)) } : null;
  } catch { return null; }
}
