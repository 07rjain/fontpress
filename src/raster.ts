import { quadArea } from './geometry';
import type { Point, Raster, Rect } from './types';

export function makeRaster(w: number, h: number, r = 255, g = 255, b = 255, a = 255): Raster {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return { w, h, data };
}

export function fillRect(
  raster: Raster,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a = 255,
) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(raster.w, Math.ceil(x + w));
  const y1 = Math.min(raster.h, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * raster.w + xx) * 4;
      raster.data[i] = r;
      raster.data[i + 1] = g;
      raster.data[i + 2] = b;
      raster.data[i + 3] = a;
    }
  }
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isLightBlue(r: number, g: number, b: number): boolean {
  return luma(r, g, b) > 145 && b > r + 12 && b > g + 6;
}

export function downscaleMax(
  src: Raster,
  maxDim: number,
): { raster: Raster; scaleX: number; scaleY: number } {
  const scale = Math.min(1, maxDim / Math.max(src.w, src.h));
  if (scale === 1) return { raster: src, scaleX: 1, scaleY: 1 };
  const w = Math.max(1, Math.round(src.w * scale));
  const h = Math.max(1, Math.round(src.h * scale));
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.min(src.h - 1, Math.floor((y * src.h) / h));
    const y1 = Math.max(y0 + 1, Math.min(src.h, Math.floor(((y + 1) * src.h) / h)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.min(src.w - 1, Math.floor((x * src.w) / w));
      const x1 = Math.max(x0 + 1, Math.min(src.w, Math.floor(((x + 1) * src.w) / w)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.w + xx) * 4;
          r += src.data[i];
          g += src.data[i + 1];
          b += src.data[i + 2];
          a += src.data[i + 3];
          n++;
        }
      }
      const o = (y * w + x) * 4;
      data[o] = r / n;
      data[o + 1] = g / n;
      data[o + 2] = b / n;
      data[o + 3] = a / n;
    }
  }
  return { raster: { w, h, data }, scaleX: src.w / w, scaleY: src.h / h };
}

type Component = {
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  sumX: number;
  sumY: number;
};

function findSquares(raster: Raster): Component[] {
  const { w, h, data } = raster;
  const dark = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < dark.length; p++, i += 4) {
    if (data[i + 3] > 128 && luma(data[i], data[i + 1], data[i + 2]) < 85) dark[p] = 1;
  }
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const comps: Component[] = [];
  const minSide = Math.min(w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (!dark[start] || seen[start]) continue;
      let sp = 0;
      stack[sp++] = start;
      seen[start] = 1;
      const comp: Component = { area: 0, minX: x, minY: y, maxX: x, maxY: y, sumX: 0, sumY: 0 };
      while (sp > 0) {
        const idx = stack[--sp];
        const cy = Math.floor(idx / w);
        const cx = idx - cy * w;
        comp.area++;
        comp.sumX += cx;
        comp.sumY += cy;
        if (cx < comp.minX) comp.minX = cx;
        if (cy < comp.minY) comp.minY = cy;
        if (cx > comp.maxX) comp.maxX = cx;
        if (cy > comp.maxY) comp.maxY = cy;
        const neighbors = [idx - 1, idx + 1, idx - w, idx + w];
        const gates = [cx > 0, cx + 1 < w, cy > 0, cy + 1 < h];
        for (let n = 0; n < 4; n++) {
          if (!gates[n]) continue;
          const next = neighbors[n];
          if (dark[next] && !seen[next]) {
            seen[next] = 1;
            stack[sp++] = next;
          }
        }
      }
      const bw = comp.maxX - comp.minX + 1;
      const bh = comp.maxY - comp.minY + 1;
      const aspect = bw / bh;
      const fill = comp.area / (bw * bh);
      if (bw < 6 || bh < 6) continue;
      if (bw > minSide * 0.16 || bh > minSide * 0.16) continue;
      if (aspect < 0.68 || aspect > 1.48) continue;
      if (fill < 0.5) continue;
      comps.push(comp);
    }
  }
  return comps;
}

export function detectSheetMarks(src: Raster): { corners: Point[]; lower: boolean } | null {
  const { raster, scaleX, scaleY } = downscaleMax(src, 900);
  const comps = findSquares(raster);
  if (comps.length < 4) return null;
  const { w, h } = raster;
  const anchors = [
    { x: 0, y: 0 },
    { x: w - 1, y: 0 },
    { x: 0, y: h - 1 },
    { x: w - 1, y: h - 1 },
  ];
  const used = new Set<number>();
  const picked: Point[] = [];
  const maxDist = 0.4 * Math.hypot(w, h);
  for (const anchor of anchors) {
    let best = -1;
    let bestDist = maxDist;
    for (let i = 0; i < comps.length; i++) {
      if (used.has(i)) continue;
      const comp = comps[i];
      const cx = comp.sumX / comp.area;
      const cy = comp.sumY / comp.area;
      const dist = Math.hypot(cx - anchor.x, cy - anchor.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    if (best < 0) return null;
    used.add(best);
    const comp = comps[best];
    picked.push({
      x: (comp.sumX / comp.area) * scaleX,
      y: (comp.sumY / comp.area) * scaleY,
    });
  }

  const area = quadArea(picked[0], picked[1], picked[2], picked[3]);
  if (area < src.w * src.h * 0.08) return null;

  const topLeft = { x: picked[0].x / scaleX, y: picked[0].y / scaleY };
  const topRight = { x: picked[1].x / scaleX, y: picked[1].y / scaleY };
  const mid = { x: (topLeft.x + topRight.x) / 2, y: (topLeft.y + topRight.y) / 2 };
  const span = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
  let lower = false;
  for (let i = 0; i < comps.length; i++) {
    if (used.has(i)) continue;
    const comp = comps[i];
    const cx = comp.sumX / comp.area;
    const cy = comp.sumY / comp.area;
    const dist = Math.hypot(cx - mid.x, cy - mid.y);
    if (dist < span * 0.22 && Math.abs(cy - mid.y) < h * 0.08) lower = true;
  }

  return { corners: picked, lower };
}

export function sampleHomography(src: Raster, homography: number[], rect: Rect, dw: number, dh: number): Raster {
  const data = new Uint8ClampedArray(dw * dh * 4);
  const sw = src.w;
  const sh = src.h;
  const sd = src.data;
  const h0 = homography[0];
  const h1 = homography[1];
  const h2 = homography[2];
  const h3 = homography[3];
  const h4 = homography[4];
  const h5 = homography[5];
  const h6 = homography[6];
  const h7 = homography[7];
  const h8 = homography[8];

  for (let y = 0; y < dh; y++) {
    const sy = rect.y + ((y + 0.5) * rect.h) / dh;
    for (let x = 0; x < dw; x++) {
      const sx = rect.x + ((x + 0.5) * rect.w) / dw;
      const den = h6 * sx + h7 * sy + h8;
      const ix = (h0 * sx + h1 * sy + h2) / den;
      const iy = (h3 * sx + h4 * sy + h5) / den;
      const oi = (y * dw + x) * 4;
      if (!Number.isFinite(ix) || !Number.isFinite(iy) || ix < 0 || iy < 0 || ix >= sw - 1 || iy >= sh - 1) {
        data[oi] = 255;
        data[oi + 1] = 255;
        data[oi + 2] = 255;
        data[oi + 3] = 255;
        continue;
      }
      const x0 = ix | 0;
      const y0 = iy | 0;
      const dx = ix - x0;
      const dy = iy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      const w00 = (1 - dx) * (1 - dy);
      const w10 = dx * (1 - dy);
      const w01 = (1 - dx) * dy;
      const w11 = dx * dy;
      data[oi] = sd[i00] * w00 + sd[i10] * w10 + sd[i01] * w01 + sd[i11] * w11;
      data[oi + 1] = sd[i00 + 1] * w00 + sd[i10 + 1] * w10 + sd[i01 + 1] * w01 + sd[i11 + 1] * w11;
      data[oi + 2] = sd[i00 + 2] * w00 + sd[i10 + 2] * w10 + sd[i01 + 2] * w01 + sd[i11 + 2] * w11;
      data[oi + 3] = 255;
    }
  }
  return { w: dw, h: dh, data };
}

function removeHairlines(raster: Raster) {
  const { w, h, data } = raster;
  const rowInk = new Uint16Array(h);
  for (let y = 0; y < h; y++) {
    let count = 0;
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 128) count++;
    }
    rowInk[y] = count;
  }
  const cut = Math.floor(w * 0.93);
  let y = 0;
  while (y < h) {
    if (rowInk[y] < cut) {
      y++;
      continue;
    }
    let end = y;
    while (end + 1 < h && rowInk[end + 1] >= cut) end++;
    if (end - y + 1 <= 10) {
      for (let yy = y; yy <= end; yy++) {
        for (let x = 0; x < w; x++) {
          const i = (yy * w + x) * 4;
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 0;
        }
      }
    }
    y = end + 1;
  }
}

function removeSpecks(raster: Raster, minArea: number) {
  const { w, h, data } = raster;
  const ink = new Uint8Array(w * h);
  for (let p = 0, i = 3; p < ink.length; p++, i += 4) {
    if (data[i] > 128) ink[p] = 1;
  }
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (!ink[start] || seen[start]) continue;
      let sp = 0;
      const pixels: number[] = [];
      stack[sp++] = start;
      seen[start] = 1;
      while (sp > 0) {
        const idx = stack[--sp];
        pixels.push(idx);
        const cy = Math.floor(idx / w);
        const cx = idx - cy * w;
        const neighbors = [idx - 1, idx + 1, idx - w, idx + w];
        const gates = [cx > 0, cx + 1 < w, cy > 0, cy + 1 < h];
        for (let n = 0; n < 4; n++) {
          if (!gates[n]) continue;
          const next = neighbors[n];
          if (ink[next] && !seen[next]) {
            seen[next] = 1;
            stack[sp++] = next;
          }
        }
      }
      if (pixels.length >= minArea) continue;
      for (const idx of pixels) {
        const i = idx * 4;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0;
      }
    }
  }
}

/** Turns a photographed cell into black ink on transparency, or null when the cell is empty. */
export function prepareCell(src: Raster, delta: number): Raster | null {
  const { w, h } = src;
  // Treat transparency as white paper, including partially transparent edge pixels.
  const opaque = new Uint8ClampedArray(src.data.length);
  for (let i = 0; i < opaque.length; i += 4) {
    const alpha = src.data[i + 3] / 255;
    for (let c = 0; c < 3; c++) opaque[i + c] = src.data[i + c] * alpha + 255 * (1 - alpha);
    opaque[i + 3] = 255;
  }
  src = { w, h, data: opaque };
  const samples: number[] = [];
  for (let i = 0; i < src.data.length; i += 4) {
    const r = src.data[i];
    const g = src.data[i + 1];
    const b = src.data[i + 2];
    if (src.data[i + 3] < 128 || isLightBlue(r, g, b)) continue;
    samples.push(luma(r, g, b));
  }
  if (samples.length < 10) return null;
  samples.sort((a, b) => a - b);
  const background = samples[Math.floor(samples.length * 0.72)];
  const cutoff = Math.min(170, background - delta);
  const out = makeRaster(w, h, 0, 0, 0, 0);
  let ink = 0;
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const r = src.data[i];
    const g = src.data[i + 1];
    const b = src.data[i + 2];
    if (src.data[i + 3] < 128 || isLightBlue(r, g, b)) continue;
    if (luma(r, g, b) <= cutoff) {
      const o = p * 4;
      out.data[o] = 16;
      out.data[o + 1] = 16;
      out.data[o + 2] = 16;
      out.data[o + 3] = 255;
      ink++;
    }
  }
  removeHairlines(out);
  removeSpecks(out, 12);
  let remaining = 0;
  for (let i = 3; i < out.data.length; i += 4) {
    if (out.data[i] > 128) remaining++;
  }
  if (remaining < 20) return null;
  if (remaining / (w * h) > 0.72) return null;
  return out;
}

export function rasterToPng(raster: Raster): string {
  const canvas = document.createElement('canvas');
  canvas.width = raster.w;
  canvas.height = raster.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the letters.');
  const copy = new Uint8ClampedArray(raster.data);
  ctx.putImageData(new ImageData(copy, raster.w, raster.h), 0, 0);
  return canvas.toDataURL('image/png');
}
