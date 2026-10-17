import opentype from 'opentype.js';
import type { Cmd } from './paths';
import { FONT, glyphName, postScriptName, safeFamily } from './spec';
import { traceImage } from './trace';

export type GlyphInput = { char: string; image: string | null; rev: number };

type CacheEntry = {
  rev: number;
  sig: number;
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

export function glyphSignature(image: string | null): number {
  if (!image) return 0;
  let hash = image.length >>> 0;
  hash = Math.imul(hash ^ image.charCodeAt(image.length >> 1), 16777619);
  hash ^= image.charCodeAt(image.length - 1);
  return hash >>> 0;
}

export async function assembleFont(
  glyphs: GlyphInput[],
  familyName: string,
  author: string,
  isCurrent: () => boolean,
  onProgress?: (done: number, total: number) => void,
): Promise<{ buffer: ArrayBuffer; covered: string[] } | null> {
  const pending = glyphs.filter((glyph) => glyph.image);
  let done = 0;
  onProgress?.(0, pending.length);

  for (const glyph of glyphs) {
    if (!isCurrent()) return null;
    const sig = glyphSignature(glyph.image);
    const cached = cache.get(glyph.char);
    if (cached && cached.rev === glyph.rev && cached.sig === sig) {
      if (glyph.image) {
        done++;
        onProgress?.(done, pending.length);
      }
      continue;
    }
    if (!glyph.image) {
      cache.set(glyph.char, { rev: glyph.rev, sig, advance: 0, commands: [], empty: true });
      continue;
    }
    try {
      const traced = await traceImage(glyph.image);
      if (!isCurrent()) return null;
      cache.set(glyph.char, {
        rev: glyph.rev,
        sig,
        advance: traced?.advance ?? 0,
        commands: traced?.commands ?? [],
        empty: !traced,
      });
    } catch {
      cache.set(glyph.char, { rev: glyph.rev, sig, advance: 0, commands: [], empty: true });
    }
    done++;
    onProgress?.(done, pending.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (!isCurrent()) return null;

  const family = safeFamily(familyName);
  const advances: number[] = [];
  const covered: string[] = [];
  const built: opentype.Glyph[] = [notdefGlyph(), spacePlaceholder()];

  for (const glyph of glyphs) {
    const entry = cache.get(glyph.char);
    if (!entry || entry.empty || entry.commands.length === 0) continue;
    built.push(
      new opentype.Glyph({
        name: glyphName(glyph.char),
        unicode: glyph.char.codePointAt(0),
        advanceWidth: entry.advance,
        path: commandsToPath(entry.commands),
      }),
    );
    advances.push(entry.advance);
    covered.push(glyph.char);
  }

  const median = medianOf(advances) || 320;
  built[1] = new opentype.Glyph({
    name: 'space',
    unicode: 32,
    advanceWidth: Math.round(Math.min(480, Math.max(180, median * 0.42))),
    path: new opentype.Path(),
  });

  const font = new opentype.Font({
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
  const blob = new Blob([buffer], { type: 'font/ttf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function commandsToPath(commands: Cmd[]): opentype.Path {
  const path = new opentype.Path();
  for (const command of commands) {
    if (command.t === 'M') path.moveTo(command.x, command.y);
    else if (command.t === 'L') path.lineTo(command.x, command.y);
    else if (command.t === 'Q') path.quadraticCurveTo(command.x1, command.y1, command.x, command.y);
    else path.close();
  }
  return path;
}

function notdefGlyph(): opentype.Glyph {
  const path = new opentype.Path();
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
  return new opentype.Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: 600,
    path,
  });
}

function spacePlaceholder(): opentype.Glyph {
  return new opentype.Glyph({
    name: 'space',
    unicode: 32,
    advanceWidth: 280,
    path: new opentype.Path(),
  });
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}
