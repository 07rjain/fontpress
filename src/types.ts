export type Point = { x: number; y: number };

export type Tool = 'pen' | 'eraser';

export type Glyph = {
  image: string | null;
  rev: number;
};

export type Project = {
  familyName: string;
  author: string;
  sampleText: string;
  glyphs: Record<string, Glyph>;
  libraryId: string | null;
};

export type Raster = {
  w: number;
  h: number;
  data: Uint8ClampedArray;
};

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};
