import { createMask, maskToUrl } from './draw';
import { detectSheetMarks, prepareCell } from './raster';
import { glyphPixelSize, placementBand, type SheetId } from './spec';
import type { Point, Raster } from './types';

export type LoadedPhoto = {
  bitmap: ImageBitmap;
  raster: Raster;
  corners: Point[];
  sheet: SheetId;
  detected: boolean;
};

export function defaultCorners(w: number, h: number): Point[] {
  const x = w * 0.07;
  const y = h * 0.07;
  return [
    { x, y },
    { x: w - x, y },
    { x, y: h - y },
    { x: w - x, y: h - y },
  ];
}

export async function loadPhotoFile(file: File): Promise<LoadedPhoto> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('Choose a JPEG or PNG photo.');
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Could not read that photo. Use a JPEG or PNG.');
  }
  const max = 3600;
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest > max) {
    const scale = max / longest;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not read that photo.');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    bitmap = await createImageBitmap(canvas);
  }
  const raster = bitmapToRaster(bitmap);
  const found = detectSheetMarks(raster);
  return {
    bitmap,
    raster,
    corners: found?.corners ?? defaultCorners(raster.w, raster.h),
    sheet: found?.lower ? 'lower' : 'upper',
    detected: Boolean(found),
  };
}

export function bitmapToRaster(bitmap: ImageBitmap): Raster {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not read that photo.');
  ctx.drawImage(bitmap, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { w: canvas.width, h: canvas.height, data: image.data };
}

export async function placeLetterPhoto(file: File, char: string): Promise<string | null> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('Choose an image of this letter.');
  }
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const source = bitmapToRaster(bitmap);
    const fitted = fitRaster(source, 900);
    const ink = prepareCell(fitted, 46);
    if (!ink) return null;
    return placeInk(ink, char);
  } finally {
    bitmap.close?.();
  }
}

function fitRaster(src: Raster, maxDim: number): Raster {
  const scale = Math.min(1, maxDim / Math.max(src.w, src.h));
  if (scale === 1) return src;
  const w = Math.max(1, Math.round(src.w * scale));
  const h = Math.max(1, Math.round(src.h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return src;
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = src.w;
  sourceCanvas.height = src.h;
  sourceCanvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(src.data), src.w, src.h), 0, 0);
  ctx.drawImage(sourceCanvas, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  return { w, h, data: image.data };
}

function placeInk(ink: Raster, char: string): string | null {
  let minX = ink.w;
  let minY = ink.h;
  let maxX = 0;
  let maxY = 0;
  let found = false;
  for (let y = 0; y < ink.h; y++) {
    for (let x = 0; x < ink.w; x++) {
      if (ink.data[(y * ink.w + x) * 4 + 3] < 128) continue;
      found = true;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!found) return null;
  const bw = Math.max(1, maxX - minX + 1);
  const bh = Math.max(1, maxY - minY + 1);
  const crop = document.createElement('canvas');
  crop.width = bw;
  crop.height = bh;
  const cropCtx = crop.getContext('2d');
  if (!cropCtx) return null;
  const full = document.createElement('canvas');
  full.width = ink.w;
  full.height = ink.h;
  full.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(ink.data), ink.w, ink.h), 0, 0);
  cropCtx.drawImage(full, minX, minY, bw, bh, 0, 0, bw, bh);

  const { w, h } = glyphPixelSize();
  const band = placementBand(char);
  let destH = Math.max(4, (band.bottom - band.top) * h);
  let destW = destH * (bw / bh);
  const maxW = w * 0.88;
  if (destW > maxW) {
    destH *= maxW / destW;
    destW = maxW;
  }
  const mask = createMask();
  const ctx = mask.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(crop, (w - destW) / 2, band.bottom * h - destH, destW, destH);
  return maskToUrl(mask);
}
