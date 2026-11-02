import type { Point, Rect } from './types';

export const PAGE = { w: 8.5, h: 11 };
export const GRID = { x: 4.5, y: 5.6, w: 91, h: 91 };
export const INK = { x: 0.07, y: 0.18, w: 0.86, h: 0.78 };

/** Guide lines as fractions of the ink window, measured from the top. */
export const GUIDES = {
  cap: 0.12,
  xh: 0.4,
  baseline: 0.74,
  desc: 0.92,
};

export const FONT = {
  unitsPerEm: 1000,
  capHeight: 700,
  ascender: 940,
  descender: -380,
  leftBearing: 45,
  rightBearing: 55,
};

export const MASK_BASE = 640;

export type SheetId = 'upper' | 'lower';

const CAPITALS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const LOWERCASE = [...'abcdefghijklmnopqrstuvwxyz'];
const FIGURES = [...'0123456789'];
const MARKS = [
  '.',
  ',',
  '!',
  '?',
  "'",
  '"',
  '-',
  '(',
  ')',
  ':',
  ';',
  '/',
  '@',
  '#',
  '$',
  '%',
  '&',
  '*',
  '+',
  '‘',
  '’',
  '“',
  '”',
];

export const GROUPS: { id: string; label: string; chars: string[] }[] = [
  { id: 'upper', label: 'Capitals', chars: CAPITALS },
  { id: 'lower', label: 'Lowercase', chars: LOWERCASE },
  { id: 'digit', label: 'Figures', chars: FIGURES },
  { id: 'punct', label: 'Marks', chars: MARKS },
];

export const CHARSET: string[] = GROUPS.flatMap((group) => group.chars);

export const SHEETS: Record<
  SheetId,
  { id: SheetId; title: string; page: string; cols: number; rows: number; chars: string[] }
> = {
  upper: {
    id: 'upper',
    title: 'Capitals and numbers',
    page: 'Page 1 of 2',
    cols: 6,
    rows: 6,
    chars: [...CAPITALS, ...FIGURES],
  },
  lower: {
    id: 'lower',
    title: 'Lowercase and marks',
    page: 'Page 2 of 2',
    cols: 7,
    rows: 7,
    chars: [...LOWERCASE, ...MARKS],
  },
};

export const DEFAULT_SAMPLE = 'The quick brown fox jumps over the lazy dog.\n"Hello," she wrote at 12:45, with $8 & 50% off.';

export const SAMPLES: { id: string; label: string; text: string }[] = [
  { id: 'pangram', label: 'Pangram', text: 'The quick brown fox jumps over the lazy dog.' },
  { id: 'note', label: 'Note', text: '"Hello," she wrote at 12:45, with $8 & 50% off.' },
  {
    id: 'alphabet',
    label: 'Alphabet',
    text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789',
  },
];

const GLYPH_NAMES: Record<string, string> = {
  '.': 'period',
  ',': 'comma',
  '!': 'exclam',
  '?': 'question',
  "'": 'quotesingle',
  '"': 'quotedbl',
  '-': 'hyphen',
  '(': 'parenleft',
  ')': 'parenright',
  ':': 'colon',
  ';': 'semicolon',
  '/': 'slash',
  '@': 'at',
  '#': 'numbersign',
  '$': 'dollar',
  '%': 'percent',
  '&': 'ampersand',
  '*': 'asterisk',
  '+': 'plus',
  '‘': 'quoteleft',
  '’': 'quoteright',
  '“': 'quotedblleft',
  '”': 'quotedblright',
};

const CHAR_LABELS: Record<string, string> = {
  '.': 'Period',
  ',': 'Comma',
  '!': 'Exclamation',
  '?': 'Question mark',
  "'": 'Apostrophe',
  '"': 'Quote',
  '-': 'Hyphen',
  '(': 'Left parenthesis',
  ')': 'Right parenthesis',
  ':': 'Colon',
  ';': 'Semicolon',
  '/': 'Slash',
  '@': 'At sign',
  '#': 'Hash',
  '$': 'Dollar',
  '%': 'Percent',
  '&': 'Ampersand',
  '*': 'Asterisk',
  '+': 'Plus',
  '‘': 'Opening single quote',
  '’': 'Closing single quote',
  '“': 'Opening double quote',
  '”': 'Closing double quote',
};

export function glyphName(char: string): string {
  if (GLYPH_NAMES[char]) return GLYPH_NAMES[char];
  if (/^[A-Za-z0-9]$/.test(char)) return char;
  const code = char.codePointAt(0) ?? 0;
  return `uni${code.toString(16).toUpperCase().padStart(4, '0')}`;
}

export function charLabel(char: string): string {
  if (CHAR_LABELS[char]) return CHAR_LABELS[char];
  if (/[A-Z]/.test(char)) return `Capital ${char}`;
  if (/[a-z]/.test(char)) return `Lowercase ${char}`;
  if (/[0-9]/.test(char)) return `Figure ${char}`;
  return char;
}

export function markMetrics() {
  const insetX = 2.15;
  const sizeX = 1.7;
  const ratio = PAGE.w / PAGE.h;
  return {
    insetX,
    insetY: insetX * ratio,
    sizeX,
    sizeY: sizeX * ratio,
  };
}

/** Corner mark centers in sheet-percent space: top-left, top-right, bottom-left, bottom-right. */
export function sheetMarkCenters(): [Point, Point, Point, Point] {
  const { insetX, insetY } = markMetrics();
  return [
    { x: insetX, y: insetY },
    { x: 100 - insetX, y: insetY },
    { x: insetX, y: 100 - insetY },
    { x: 100 - insetX, y: 100 - insetY },
  ];
}

/** Extra mark printed on page 2 so a photo can be told apart from page 1. */
export function pageFlagCenter(): Point {
  const { insetY } = markMetrics();
  return { x: 50, y: insetY };
}

export function cellRect(sheet: SheetId, index: number): Rect {
  const { cols, rows } = SHEETS[sheet];
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: GRID.x + (GRID.w / cols) * col,
    y: GRID.y + (GRID.h / rows) * row,
    w: GRID.w / cols,
    h: GRID.h / rows,
  };
}

export function inkRect(sheet: SheetId, index: number): Rect {
  const cell = cellRect(sheet, index);
  return {
    x: cell.x + cell.w * INK.x,
    y: cell.y + cell.h * INK.y,
    w: cell.w * INK.w,
    h: cell.h * INK.h,
  };
}

export function inkAspect(): number {
  const cellW = (GRID.w / SHEETS.upper.cols / 100) * PAGE.w;
  const cellH = (GRID.h / SHEETS.upper.rows / 100) * PAGE.h;
  return (cellW * INK.w) / (cellH * INK.h);
}

export function glyphPixelSize(base = MASK_BASE): { w: number; h: number; aspect: number } {
  const aspect = inkAspect();
  return { w: base, h: Math.max(1, Math.round(base / aspect)), aspect };
}

/** Where a loose photo of one letter should sit inside the mask. */
export function placementBand(char: string): { top: number; bottom: number } {
  if ('acemnorsuvwxz'.includes(char)) return { top: GUIDES.xh, bottom: GUIDES.baseline };
  if (char === 'j') return { top: GUIDES.cap, bottom: GUIDES.desc };
  if ('gpyq'.includes(char)) return { top: GUIDES.xh, bottom: GUIDES.desc };
  if (char === ',' || char === ';') return { top: GUIDES.baseline - 0.12, bottom: GUIDES.desc };
  if (char === '.') return { top: GUIDES.baseline - 0.14, bottom: GUIDES.baseline - 0.01 };
  if ("'\"‘’“”".includes(char)) return { top: GUIDES.cap, bottom: GUIDES.xh };
  if (char === '-') {
    const mid = (GUIDES.xh + GUIDES.baseline) / 2;
    return { top: mid - 0.035, bottom: mid + 0.035 };
  }
  return { top: GUIDES.cap, bottom: GUIDES.baseline };
}

export function safeFamily(name: string): string {
  const clean = name.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim().slice(0, 40);
  return clean || 'My Hand';
}

export function postScriptName(name: string): string {
  const clean = safeFamily(name).replace(/[^A-Za-z0-9-]/g, '') || 'MyHand';
  return clean.slice(0, 31);
}

export function fontFileName(name: string, extension: 'otf' | 'ttf' = 'otf'): string {
  const clean = safeFamily(name.trim().replace(/(?:\.(?:ttf|otf))+$/i, ''))
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9-]/g, '');
  return `${clean || 'My-Hand'}.${extension}`;
}

function assertSpec() {
  const upper = SHEETS.upper;
  const lower = SHEETS.lower;
  if (upper.chars.length !== upper.cols * upper.rows) {
    throw new Error('Page 1 does not fill its grid.');
  }
  if (lower.chars.length !== lower.cols * lower.rows) {
    throw new Error('Page 2 does not fill its grid.');
  }
  if (upper.cols !== upper.rows || lower.cols !== lower.rows || GRID.w !== GRID.h) {
    throw new Error('Sheet cells must share one aspect ratio.');
  }
  const all = [...upper.chars, ...lower.chars];
  if (new Set(all).size !== all.length) throw new Error('Duplicate character on the template.');
  if (all.length !== CHARSET.length) throw new Error('Template and studio character sets differ.');
  for (const char of CHARSET) {
    if (!all.includes(char)) throw new Error(`Missing template cell for ${char}`);
  }
}

assertSpec();
