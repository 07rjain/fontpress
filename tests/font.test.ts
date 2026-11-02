// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import opentype from 'opentype.js';
import { assembleFont, clearFontCache, projectFromFont, saveFontFile } from '../src/font';
import { fontFileName, glyphPixelSize } from '../src/spec';
import { fillRect, makeRaster, prepareCell } from '../src/raster';
import { fontFormat } from '../src/fontFormat';
import { fontFixture, letterPng } from './fixtures';
import { installCanvas } from './canvas';

beforeEach(() => { installCanvas(); clearFontCache(); });

test('transparent artwork preserves the same ink as artwork on white paper', () => {
  const transparent = makeRaster(100, 100, 0, 0, 0, 0);
  const paper = makeRaster(100, 100);
  for (const raster of [transparent, paper]) fillRect(raster, 40, 20, 20, 60, 0, 0, 0);
  const result = prepareCell(transparent, 46);
  expect(result).not.toBeNull();
  expect(result!.data[(30 * 100 + 50) * 4 + 3]).toBe(255);
  expect(result!.data[3]).toBe(0);
  expect(result).toEqual(prepareCell(paper, 46));
});

test('horizontal spacing survives serialization and generated fonts use the correct OpenType format', async () => {
  const image = letterPng();
  const original = await assembleFont([{ char: 'A', image, rev: 1, offsetX: 0 }], 'Example', '', () => true);
  const nudged = await assembleFont([{ char: 'A', image, rev: 1, offsetX: 20 }], 'Example', '', () => true);
  expect(original!.covered).toEqual(['A']);
  const a = opentype.parse(original!.buffer).charToGlyph('A');
  const b = opentype.parse(nudged!.buffer).charToGlyph('A');
  const delta = 20 * 700 / (0.62 * glyphPixelSize().h);
  expect(b.path.getBoundingBox().x1 - a.path.getBoundingBox().x1).toBeCloseTo(delta, 0);
  expect(b.advanceWidth).toBe(a.advanceWidth);
  expect(new TextDecoder().decode(new Uint8Array(nudged!.buffer).slice(0, 4))).toBe('OTTO');
  expect(fontFormat(nudged!.buffer)).toEqual({ extension: 'otf', mime: 'font/otf' });
  expect(fontFileName('Example')).toBe('Example.otf');
});

test.each(['Brush', 'Brush.otf', 'Brush.ttf', 'Brush.otf.ttf'])('downloading %s uses one OpenType extension and preserves the font bytes', async (name) => {
  const bytes = fontFixture(['A']);
  let file!: Blob;
  URL.createObjectURL = (blob: Blob | MediaSource) => { file = blob as Blob; return 'blob:font'; };
  URL.revokeObjectURL = () => {};
  let filename = '';
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { filename = this.download; });
  saveFontFile(bytes, name);
  expect(filename).toBe('Brush.otf');
  expect(file.type).toBe('application/octet-stream');
  const savedBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
  expect(new Uint8Array(savedBytes)).toEqual(new Uint8Array(bytes));
});

test('older compiled fonts can be recovered into editable drawings', async () => {
  const built = await assembleFont([{ char: 'A', image: letterPng(), rev: 1 }], 'Legacy', 'Designer', () => true);
  const restored = await projectFromFont(built!.buffer, 'Legacy', 'Designer');
  expect(restored.familyName).toBe('Legacy');
  expect(restored.author).toBe('Designer');
  expect(restored.glyphs.A.image).toMatch(/^data:image\/png;base64,/);
  expect(restored.glyphs.B.image).toBeNull();
  const rebuilt = await assembleFont([{ char: 'A', ...restored.glyphs.A }], 'Legacy', 'Designer', () => true);
  expect(rebuilt!.covered).toEqual(['A']);
});
