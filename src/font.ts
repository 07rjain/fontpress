import type opentype from 'opentype.js';
import type { Cmd } from './paths';
import { shiftX } from './paths';
import { FONT, GUIDES, glyphPixelSize, glyphName, postScriptName, safeFamily, CHARSET } from './spec';
import { fontFormat } from './fontFormat';
import { emptyProject } from './project';
import { createMask, maskToUrl } from './draw';

export type GlyphInput = { char: string; image: string | null; rev: number; offsetX?: number };

type CacheEntry = {
  rev: number;
  image: string | null;
  advance: number;
  commands: Cmd[];
  empty: boolean;
};

const cache = new Map<string, CacheEntry>();

let chain: Promise<unknown> = Promise.resolve();
let liveFace: FontFace | null = null;

export function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function clearFontCache() {
  cache.clear();
}

export async function assembleFont(
  glyphs: GlyphInput[],
  familyName: string,
  author: string,
  isCurrent: () => boolean,
  onProgress?: (done: number, total: number) => void,
): Promise<{ buffer: ArrayBuffer; covered: string[] } | null> {
  const [{ default: ot }, { traceImage }] = await Promise.all([import('opentype.js'), import('./trace')]);
  if (!isCurrent()) return null;
  const pending = glyphs.filter((glyph) => glyph.image);
  let done = 0;
  onProgress?.(0, pending.length);

  for (const glyph of glyphs) {
    if (!isCurrent()) return null;
    const cached = cache.get(glyph.char);
    if (cached && cached.rev === glyph.rev && cached.image === glyph.image) {
      if (glyph.image) {
        done++;
        onProgress?.(done, pending.length);
      }
      continue;
    }
    if (!glyph.image) {
      cache.set(glyph.char, { rev: glyph.rev, image: null, advance: 0, commands: [], empty: true });
      continue;
    }
    try {
      const traced = await traceImage(glyph.image);
      if (!isCurrent()) return null;
      cache.set(glyph.char, {
        rev: glyph.rev,
        image: glyph.image,
        advance: traced?.advance ?? 0,
        commands: traced?.commands ?? [],
        empty: !traced,
      });
    } catch {
      if (!isCurrent()) return null;
      cache.set(glyph.char, { rev: glyph.rev, image: glyph.image, advance: 0, commands: [], empty: true });
    }
    done++;
    onProgress?.(done, pending.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (!isCurrent()) return null;

  const family = safeFamily(familyName);
  const advances: number[] = [];
  const covered: string[] = [];
  const built: opentype.Glyph[] = [notdefGlyph(ot), spacePlaceholder(ot)];
  const unitsPerPixel = FONT.capHeight / ((GUIDES.baseline - GUIDES.cap) * glyphPixelSize().h);

  for (const glyph of glyphs) {
    const entry = cache.get(glyph.char);
    if (!entry || entry.empty || entry.commands.length === 0) continue;
    built.push(
      new ot.Glyph({
        name: glyphName(glyph.char),
        unicode: glyph.char.codePointAt(0),
        advanceWidth: entry.advance,
        path: commandsToPath(ot, shiftX(entry.commands, (glyph.offsetX ?? 0) * unitsPerPixel)),
      }),
    );
    advances.push(entry.advance);
    covered.push(glyph.char);
  }

  const median = medianOf(advances) || 320;
  built[1] = new ot.Glyph({
    name: 'space',
    unicode: 32,
    advanceWidth: Math.round(Math.min(480, Math.max(180, median * 0.42))),
    path: new ot.Path(),
  });

  const font = new ot.Font({
    familyName: family,
    styleName: 'Regular',
    fullName: `${family} Regular`,
    postScriptName: postScriptName(family),
    designer: author.trim() || 'Handpress',
    manufacturer: 'Handpress',
    description: 'Handwriting captured with Handpress.',
    unitsPerEm: FONT.unitsPerEm,
    ascender: FONT.ascender,
    descender: FONT.descender,
    glyphs: built,
  });

  return { buffer: font.toArrayBuffer(), covered };
}

export async function publishPreview(buffer: ArrayBuffer, still: () => boolean) {
  const face = new FontFace('HandpressUser', buffer);
  await face.load();
  if (!still()) return;
  if (liveFace) document.fonts.delete(liveFace);
  document.fonts.add(face);
  liveFace = face;
}

export function clearPreview() {
  if (!liveFace) return;
  document.fonts.delete(liveFace);
  liveFace = null;
}

export function saveFontFile(buffer: ArrayBuffer, filename: string) {
  const format = fontFormat(buffer);
  const blob = new Blob([buffer], { type: format.mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.replace(/\.(?:ttf|otf)$/i, `.${format.extension}`);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function commandsToPath(ot: typeof opentype, commands: Cmd[]): opentype.Path {
  const path = new ot.Path();
  for (const command of commands) {
    if (command.t === 'M') path.moveTo(command.x, command.y);
    else if (command.t === 'L') path.lineTo(command.x, command.y);
    else if (command.t === 'Q') path.quadraticCurveTo(command.x1, command.y1, command.x, command.y);
    else path.close();
  }
  return path;
}

function notdefGlyph(ot: typeof opentype): opentype.Glyph {
  const path = new ot.Path();
  path.moveTo(80, -240);
  path.lineTo(520, -240);
  path.lineTo(520, 720);
  path.lineTo(80, 720);
  path.close();
  path.moveTo(150, -170);
  path.lineTo(150, 650);
  path.lineTo(450, 650);
  path.lineTo(450, -170);
  path.close();
  return new ot.Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: 600,
    path,
  });
}

function spacePlaceholder(ot: typeof opentype): opentype.Glyph {
  return new ot.Glyph({
    name: 'space',
    unicode: 32,
    advanceWidth: 280,
    path: new ot.Path(),
  });
}

/** Recovers editable drawings for older library entries that only stored a font. */
export async function projectFromFont(buffer: ArrayBuffer, name: string, designer: string) {
  const { default: ot } = await import('opentype.js');
  const font = ot.parse(buffer);
  const project = emptyProject();
  project.familyName = name;
  project.author = designer;
  const { h } = glyphPixelSize();
  const pixelsPerUnit = ((GUIDES.baseline - GUIDES.cap) * h) / FONT.capHeight;
  for (const char of CHARSET) {
    if (!font.charToGlyphIndex(char)) continue;
    const glyph = font.charToGlyph(char);
    const mask = createMask();
    const ctx = mask.getContext('2d');
    if (!ctx) throw new Error('Could not restore the saved font.');
    glyph.getPath(0, GUIDES.baseline * h, font.unitsPerEm * pixelsPerUnit).draw(ctx);
    project.glyphs[char] = { image: maskToUrl(mask), rev: 1, offsetX: 0 };
  }
  return project;
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}
