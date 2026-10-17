import type { Point } from './types';

export function solveLinear(matrix: number[][], values: number[]): number[] | null {
  const n = values.length;
  const rows = matrix.map((row, index) => [...row, values[index]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    }
    if (Math.abs(rows[pivot][col]) < 1e-10) return null;
    if (pivot !== col) {
      const swap = rows[col];
      rows[col] = rows[pivot];
      rows[pivot] = swap;
    }
    const divisor = rows[col][col];
    for (let colIndex = col; colIndex <= n; colIndex++) rows[col][colIndex] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = rows[row][col];
      if (factor === 0) continue;
      for (let colIndex = col; colIndex <= n; colIndex++) {
        rows[row][colIndex] -= factor * rows[col][colIndex];
      }
    }
  }

  return rows.map((row) => row[n]);
}

/** Maps `from` points onto `to` points. Returns null when the corners are degenerate. */
export function solveHomography(from: Point[], to: Point[]): number[] | null {
  const rows: number[][] = [];
  const values: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const xp = to[i].x;
    const yp = to[i].y;
    rows.push([x, y, 1, 0, 0, 0, -x * xp, -y * xp]);
    values.push(xp);
    rows.push([0, 0, 0, x, y, 1, -x * yp, -y * yp]);
    values.push(yp);
  }
  const solved = solveLinear(rows, values);
  if (!solved) return null;
  return [solved[0], solved[1], solved[2], solved[3], solved[4], solved[5], solved[6], solved[7], 1];
}

export function applyH(homography: number[], x: number, y: number): Point {
  const divisor = homography[6] * x + homography[7] * y + homography[8];
  return {
    x: (homography[0] * x + homography[1] * y + homography[2]) / divisor,
    y: (homography[3] * x + homography[4] * y + homography[5]) / divisor,
  };
}

export function quadArea(tl: Point, tr: Point, bl: Point, br: Point): number {
  const pts = [tl, tr, br, bl];
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const current = pts[i];
    const next = pts[(i + 1) % 4];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}
