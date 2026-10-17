import { GUIDES } from './spec';
import { glyphPixelSize } from './spec';
import type { Point } from './types';

export function createMask(): HTMLCanvasElement {
  const { w, h } = glyphPixelSize();
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

export function maskContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not draw.');
  return ctx;
}

export function paintUrl(canvas: HTMLCanvasElement, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const ctx = maskContext(canvas);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    image.onerror = () => reject(new Error('Could not read the drawing.'));
    image.src = url;
  });
}

export function maskHasInk(canvas: HTMLCanvasElement): boolean {
  const ctx = maskContext(canvas);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let count = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 30) {
      count++;
      if (count > 24) return true;
    }
  }
  return false;
}

export function maskToUrl(canvas: HTMLCanvasElement): string | null {
  if (!maskHasInk(canvas)) return null;
  return canvas.toDataURL('image/png');
}

export function strokeOn(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  width: number,
  erase: boolean,
) {
  if (points.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = erase ? width * 2.7 : width;
  ctx.strokeStyle = '#14120f';
  ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 1) {
    ctx.lineTo(points[0].x + 0.01, points[0].y);
  } else if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
  } else {
    for (let i = 1; i < points.length - 1; i++) {
      const mx = (points[i].x + points[i + 1].x) / 2;
      const my = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  }
  ctx.stroke();
  ctx.restore();
}

export function paintGuides(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  char: string,
) {
  ctx.save();
  ctx.fillStyle = 'rgba(28, 25, 22, 0.05)';
  ctx.font = `560 ${Math.round(h * 0.46)}px Fraunces, Palatino, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(char, w / 2, h * 0.46);
  ctx.restore();

  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(28, 25, 22, 0.12)';
  ctx.beginPath();
  ctx.moveTo(w * 0.08, GUIDES.cap * h);
  ctx.lineTo(w * 0.08, GUIDES.desc * h);
  ctx.moveTo(w * 0.92, GUIDES.cap * h);
  ctx.lineTo(w * 0.92, GUIDES.desc * h);
  ctx.stroke();

  const lines = [
    { y: GUIDES.cap, color: 'rgba(28, 25, 22, 0.2)', width: 1 },
    { y: GUIDES.xh, color: 'rgba(28, 25, 22, 0.14)', width: 1 },
    { y: GUIDES.baseline, color: 'rgba(196, 85, 58, 0.9)', width: 1.5 },
    { y: GUIDES.desc, color: 'rgba(28, 25, 22, 0.16)', width: 1 },
  ];
  for (const line of lines) {
    ctx.beginPath();
    ctx.strokeStyle = line.color;
    ctx.lineWidth = line.width;
    const y = line.y * h;
    ctx.moveTo(w * 0.06, y);
    ctx.lineTo(w * 0.94, y);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(196, 85, 58, 0.9)';
  ctx.font = '500 11px "Libre Franklin", sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('baseline', w * 0.94, GUIDES.baseline * h - 4);
  ctx.restore();
}

export async function nudgeImage(url: string, dx: number, dy: number): Promise<string | null> {
  const source = createMask();
  await paintUrl(source, url);
  const shifted = createMask();
  maskContext(shifted).drawImage(source, dx, dy);
  return maskToUrl(shifted);
}
