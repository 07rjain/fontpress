import { mkdir, writeFile } from 'node:fs/promises';
import { createCanvas, Image } from '@napi-rs/canvas';
import opentype from 'opentype.js';
import { assembleFont } from '../src/font';
import { strokeOn } from '../src/draw';
import { glyphPixelSize } from '../src/spec';

// Authored pen-stroke coordinates, rasterized and exported through the real
// Fontpress pipeline. This example is not a customer submission or a full font.
const strokes: Record<string, number[][][]> = {
  H: [[[.24, .18], [.22, .46], [.25, .8]], [[.7, .2], [.67, .5], [.69, .79]], [[.24, .49], [.46, .47], [.68, .5]]],
  i: [[[.47, .44], [.45, .63], [.48, .78]], [[.47, .25]]],
  '!': [[[.47, .18], [.45, .41], [.46, .57]], [[.46, .77]]],
};
// traceImage needs just canvas creation and Image decoding; no browser or account.
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(1, 1) },
  Image,
});
const { w, h } = glyphPixelSize();
const input = createCanvas(900, 300);
const ink = input.getContext('2d');
ink.fillStyle = '#f8f4ec'; ink.fillRect(0, 0, 900, 300);
const glyphs = Object.entries(strokes).map(([char, paths], i) => {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  for (const points of paths) strokeOn(ctx as unknown as CanvasRenderingContext2D,
    points.map(([x, y]) => ({ x: x * w, y: y * h })), 15, false);
  ink.drawImage(canvas, 150 + i * 220, 0, 220, 300);
  return { char, image: canvas.toDataURL('image/png'), rev: 1 };
});
const result = await assembleFont(glyphs, 'Fontpress Example', 'Fontpress', () => true);
if (!result || result.covered.length !== 3) throw new Error('The sample characters could not be traced.');
const font = opentype.parse(result.buffer);
const path = font.getPath('Hi!', 170, 235, 240);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 300" width="900" height="300"><rect width="900" height="300" fill="#f8f4ec"/>${path.toSVG(2)}</svg>\n`;
await mkdir('public/examples', { recursive: true });
await writeFile('public/examples/drawn-characters.png', input.toBuffer('image/png'));
await writeFile('public/examples/traced-characters.svg', svg);

const card = createCanvas(1200, 630);
const ctx = card.getContext('2d');
ctx.fillStyle = '#e9e2d4'; ctx.fillRect(0, 0, 1200, 630);
ctx.fillStyle = '#243f38'; ctx.fillRect(64, 60, 62, 62);
ctx.fillStyle = '#f8f4ec'; ctx.font = 'bold 42px serif'; ctx.fillText('F', 78, 106);
ctx.fillStyle = '#1c1915'; ctx.font = 'bold 30px serif'; ctx.fillText('Fontpress', 144, 102);
ctx.font = 'bold 70px serif'; ctx.fillText('Turn your handwriting', 64, 260); ctx.fillText('into a font.', 64, 345);
ctx.font = '28px sans-serif'; ctx.fillText('Free online handwriting font generator', 64, 426);
ctx.font = '23px sans-serif'; ctx.fillText('Draw. Preview. Download an OpenType font.', 64, 483);
ctx.strokeStyle = '#c4553a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(64, 535); ctx.lineTo(1136, 535); ctx.stroke();
await writeFile('public/social-card.png', card.toBuffer('image/png'));
console.log('Created a real three-character tracing example and a 1200×630 social card.');
