import opentype from 'opentype.js';
import { createCanvas } from '@napi-rs/canvas';
import { glyphPixelSize } from '../src/spec';
import { emptyProject } from '../src/project';

export function letterPng() {
  const { w, h } = glyphPixelSize();
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#111';
  ctx.fillRect(100, 100, 100, 200);
  return canvas.toDataURL('image/png');
}

export function fontFixture(chars: string[], empty = false) {
  const path = new opentype.Path();
  if (!empty) {
    path.moveTo(45, 0); path.lineTo(445, 0); path.lineTo(445, 700); path.lineTo(45, 700); path.close();
  }
  return new opentype.Font({ familyName: 'Fixture', styleName: 'Regular', unitsPerEm: 1000, ascender: 940, descender: -380,
    glyphs: [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
      ...chars.map((char) => new opentype.Glyph({ name: `uni${char.codePointAt(0)!.toString(16)}`, unicode: char.codePointAt(0), advanceWidth: 500, path }))],
  }).toArrayBuffer();
}

export function projectFixture(chars: string[] = ['A'], name = 'My draft') {
  const project = emptyProject();
  project.familyName = name;
  const image = letterPng();
  for (const char of chars) project.glyphs[char] = { image, rev: 1, offsetX: 0 };
  return project;
}
