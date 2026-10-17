import { FONT, GUIDES, glyphPixelSize } from './spec';
import type { Cmd } from './paths';
import { boundsOf, orient, shiftX } from './paths';

type Segment = {
  type: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3?: number;
  y3?: number;
};

type TracePath = {
  segments?: Segment[];
  isholepath?: boolean;
};

const TRACE_OPTIONS = {
  ltres: 0.85,
  qtres: 0.85,
  pathomit: 8,
  rightangleenhance: false,
  colorsampling: 0,
  numberofcolors: 2,
  mincolorratio: 0,
  colorquantcycles: 1,
  layering: 0,
  linefilter: false,
  scale: 1,
  roundcoords: 1,
  blurradius: 0,
  blurdelta: 20,
  pal: [
    { r: 16, g: 16, b: 16, a: 255 },
    { r: 255, g: 255, b: 255, a: 255 },
  ],
};

function asPaths(layer: unknown): TracePath[] {
  if (Array.isArray(layer)) return layer as TracePath[];
  if (layer && typeof layer === 'object' && Array.isArray((layer as { paths?: unknown }).paths)) {
    return (layer as { paths: TracePath[] }).paths;
  }
  return [];
}

export async function traceImage(url: string): Promise<{ commands: Cmd[]; advance: number } | null> {
  const image = await loadImage(url);
  const { w, h } = glyphPixelSize();
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(image, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const ImageTracer = (await import('imagetracerjs')).default;
  const traced = ImageTracer.imagedataToTracedata(imageData, TRACE_OPTIONS);
  const palette = traced.palette ?? [];
  let best = 0;
  let bestScore = Infinity;
  for (let i = 0; i < traced.layers.length; i++) {
    const color = palette[i];
    if (!color) continue;
    const score = color.r + color.g + color.b;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  const scale = FONT.capHeight / ((GUIDES.baseline - GUIDES.cap) * h);
  const mapPoint = (x: number, y: number) => ({
    x: x * scale,
    y: (GUIDES.baseline * h - y) * scale,
  });

  const contours: Cmd[][] = [];
  for (const path of asPaths(traced.layers[best])) {
    const segments = path.segments ?? [];
    if (segments.length < 2) continue;
    const commands: Cmd[] = [];
    const start = mapPoint(segments[0].x1, segments[0].y1);
    commands.push({ t: 'M', x: start.x, y: start.y });
    for (const segment of segments) {
      if (segment.type === 'Q' && segment.x3 != null && segment.y3 != null) {
        const control = mapPoint(segment.x2, segment.y2);
        const end = mapPoint(segment.x3, segment.y3);
        commands.push({ t: 'Q', x1: control.x, y1: control.y, x: end.x, y: end.y });
      } else {
        const end = mapPoint(segment.x2, segment.y2);
        commands.push({ t: 'L', x: end.x, y: end.y });
      }
    }
    commands.push({ t: 'Z' });
    const oriented = orient(commands, !path.isholepath);
    if (Math.abs(boundsArea(oriented)) < 18) continue;
    contours.push(oriented);
  }

  const flat = contours.flat();
  const box = boundsOf(flat);
  if (!box) return null;
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  if (width < 6 && height < 6) return null;
  const dx = FONT.leftBearing - box.minX;
  return {
    commands: contours.flatMap((contour) => shiftX(contour, dx)),
    advance: Math.max(90, Math.round(width + FONT.leftBearing + FONT.rightBearing)),
  };
}

function boundsArea(commands: Cmd[]): number {
  const box = boundsOf(commands);
  if (!box) return 0;
  return (box.maxX - box.minX) * (box.maxY - box.minY);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read a letter.'));
    image.src = url;
  });
}
