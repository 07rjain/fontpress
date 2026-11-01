import { normalizeProject } from '../src/project';
import { CHARSET, glyphPixelSize } from '../src/spec';
import type { Project } from '../src/types';

/** Accept only bounded PNG drawings; source is never included in public metadata. */
export function readProjectUpload(value: unknown): Project | null {
  if (typeof value !== 'string' || value.length > 12 * 1024 * 1024) return null;
  try {
    const raw = JSON.parse(value);
    if (!raw || typeof raw !== 'object' || !raw.glyphs || typeof raw.glyphs !== 'object') return null;
    const { w, h } = glyphPixelSize();
    for (const char of CHARSET) {
      const glyph = raw.glyphs[char];
      if (!glyph || glyph.image === null) continue;
      const image = glyph.image;
      if (typeof image !== 'string' || image.length > 512 * 1024 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) return null;
      const bytes = Buffer.from(image.slice('data:image/png;base64,'.length), 'base64');
      if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
        || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(16) !== w || bytes.readUInt32BE(20) !== h) return null;
    }
    return normalizeProject(raw);
  } catch { return null; }
}
