import opentype from 'opentype.js';

const SIGNATURES = new Set([0x00010000, 0x74727565, 0x4f54544f]);

/** Returns the number of mapped, non-space glyphs, or null when the bytes are not a usable OpenType font. */
export function inspectFont(bytes: Uint8Array): { glyphCount: number } | null {
  if (bytes.byteLength < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!SIGNATURES.has(view.getUint32(0))) return null;
  try {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const font = opentype.parse(buffer);
    let glyphCount = 0;
    for (let index = 0; index < font.glyphs.length; index++) {
      const unicode = font.glyphs.get(index).unicode;
      if (unicode && unicode !== 32) glyphCount++;
    }
    return glyphCount > 0 ? { glyphCount } : null;
  } catch {
    return null;
  }
}
