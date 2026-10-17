import { solveHomography } from './geometry';
import { prepareCell, rasterToPng, sampleHomography } from './raster';
import { SHEETS, glyphPixelSize, inkRect, sheetMarkCenters, type SheetId } from './spec';
import type { Point, Raster } from './types';

export async function extractSheet(
  src: Raster,
  corners: Point[],
  sheet: SheetId,
  delta: number,
  isCancelled: () => boolean,
  onProgress: (done: number, total: number) => void,
): Promise<Record<string, string>> {
  const homography = solveHomography(sheetMarkCenters(), corners);
  if (!homography) {
    throw new Error('Those corners do not line up. Drag them onto the four black squares.');
  }
  const { w, h } = glyphPixelSize();
  const chars = SHEETS[sheet].chars;
  const images: Record<string, string> = {};
  for (let i = 0; i < chars.length; i++) {
    if (isCancelled()) return images;
    const sampled = sampleHomography(src, homography, inkRect(sheet, i), w, h);
    const ink = prepareCell(sampled, delta);
    if (ink) images[chars[i]] = rasterToPng(ink);
    if (i % 2 === 1 || i === chars.length - 1) {
      onProgress(i + 1, chars.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return images;
}
