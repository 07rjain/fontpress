import opentype from 'opentype.js';
import { inspectFont } from '../server/inspect';
import { applyH, quadArea, solveHomography } from '../src/geometry';
import { orient, reverseContour, signedArea, type Cmd } from '../src/paths';
import { detectSheetMarks, fillRect, makeRaster, prepareCell } from '../src/raster';
import { CHARSET, SHEETS, sheetMarkCenters } from '../src/spec';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function near(a: number, b: number, eps = 1e-6) {
  assert(Math.abs(a - b) < eps, `Expected ${a} to be near ${b}`);
}

const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 0, y: 80 },
  { x: 100, y: 80 },
];
const identity = solveHomography(square, square);
assert(identity, 'identity homography');
const mid = applyH(identity!, 40, 20);
near(mid.x, 40, 1e-4);
near(mid.y, 20, 1e-4);

const from = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 0, y: 10 },
  { x: 10, y: 8 },
];
const to = [
  { x: 5, y: 4 },
  { x: 21, y: 6 },
  { x: 7, y: 24 },
  { x: 23, y: 22 },
];
const mapped = solveHomography(from, to);
assert(mapped, 'perspective homography');
from.forEach((point, index) => {
  const got = applyH(mapped!, point.x, point.y);
  near(got.x, to[index].x, 1e-4);
  near(got.y, to[index].y, 1e-4);
});

const ccw: Cmd[] = [
  { t: 'M', x: 0, y: 0 },
  { t: 'L', x: 10, y: 0 },
  { t: 'L', x: 10, y: 10 },
  { t: 'L', x: 0, y: 10 },
  { t: 'Z' },
];
assert(signedArea(ccw) > 0, 'square should be counter-clockwise');
assert(signedArea(reverseContour(ccw)) < 0, 'reversed square should be clockwise');
assert(signedArea(orient(reverseContour(ccw), true)) > 0, 'orient forces counter-clockwise');

const photo = makeRaster(600, 800, 245, 245, 245);
const marks = [
  [40, 36],
  [540, 36],
  [40, 740],
  [540, 740],
];
for (const [x, y] of marks) fillRect(photo, x, y, 28, 28, 0, 0, 0);
fillRect(photo, 286, 36, 28, 28, 0, 0, 0);
const found = detectSheetMarks(photo);
assert(found, 'marks detected');
assert(found!.lower, 'center flag marks page 2');
assert(found!.corners.length === 4, 'four corners');
near(found!.corners[0].x, 54, 8);
near(found!.corners[1].x, 554, 8);
assert(quadArea(found!.corners[0], found!.corners[1], found!.corners[2], found!.corners[3]) > 100000, 'quad area');

const cell = makeRaster(80, 100, 250, 250, 250);
for (let x = 0; x < 80; x++) fillRect(cell, x, 70, 1, 2, 126, 173, 212);
fillRect(cell, 30, 20, 16, 40, 15, 15, 15);
const ink = prepareCell(cell, 48);
assert(ink, 'letter ink kept');
let blueLeft = 0;
let black = 0;
for (let i = 0; i < ink!.data.length; i += 4) {
  if (ink!.data[i + 3] < 128) continue;
  black++;
  if (ink!.data[i + 2] > ink!.data[i] + 10) blueLeft++;
}
assert(black > 100, 'black ink remains');
assert(blueLeft === 0, 'blue guide removed');

const empty = prepareCell(makeRaster(40, 40, 250, 250, 250), 48);
assert(empty === null, 'blank cell skipped');

const path = new opentype.Path();
path.moveTo(100, 0);
path.lineTo(500, 0);
path.lineTo(500, 700);
path.lineTo(100, 700);
path.close();
const font = new opentype.Font({
  familyName: 'Check',
  styleName: 'Regular',
  unitsPerEm: 1000,
  ascender: 940,
  descender: -380,
  glyphs: [
    new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
    new opentype.Glyph({ name: 'A', unicode: 65, advanceWidth: 600, path }),
  ],
});
const fontBytes = new Uint8Array(font.toArrayBuffer());
const parsed = opentype.parse(fontBytes.buffer);
assert(parsed.charToGlyph('A').advanceWidth === 600, 'glyph advance survived the font file');
assert(inspectFont(fontBytes)?.glyphCount === 1, 'server counts the mapped glyphs in an upload');
assert(inspectFont(new TextEncoder().encode('{"name":"not a font"}')) === null, 'server rejects non-font uploads');
assert(inspectFont(fontBytes.slice(0, 40)) === null, 'server rejects truncated fonts');
assert(CHARSET.length === SHEETS.upper.chars.length + SHEETS.lower.chars.length, 'charset matches sheets');
assert(sheetMarkCenters().length === 4, 'mark centers');

console.log('handpress checks passed');
