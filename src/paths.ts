import type { Point } from './types';

export type Cmd =
  | { t: 'M'; x: number; y: number }
  | { t: 'L'; x: number; y: number }
  | { t: 'Q'; x1: number; y1: number; x: number; y: number }
  | { t: 'Z' };

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export function signedArea(commands: Cmd[]): number {
  const points: Point[] = [];
  let currentX = 0;
  let currentY = 0;
  for (const command of commands) {
    if (command.t === 'M' || command.t === 'L') {
      points.push({ x: command.x, y: command.y });
      currentX = command.x;
      currentY = command.y;
    } else if (command.t === 'Q') {
      points.push({
        x: 0.25 * currentX + 0.5 * command.x1 + 0.25 * command.x,
        y: 0.25 * currentY + 0.5 * command.y1 + 0.25 * command.y,
      });
      points.push({ x: command.x, y: command.y });
      currentX = command.x;
      currentY = command.y;
    }
  }
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

export function reverseContour(commands: Cmd[]): Cmd[] {
  const body = commands.filter((command) => command.t !== 'Z');
  const start = body[0];
  if (!start || start.t !== 'M') return commands;

  type Seg =
    | { kind: 'L'; x: number; y: number }
    | { kind: 'Q'; cx: number; cy: number; x: number; y: number };
  const segments: Seg[] = [];
  for (let i = 1; i < body.length; i++) {
    const command = body[i];
    if (command.t === 'L') segments.push({ kind: 'L', x: command.x, y: command.y });
    else if (command.t === 'Q') {
      segments.push({ kind: 'Q', cx: command.x1, cy: command.y1, x: command.x, y: command.y });
    }
  }
  const end = segments[segments.length - 1];
  if (!end) return commands;

  const reversed: Cmd[] = [{ t: 'M', x: end.x, y: end.y }];
  for (let i = segments.length - 1; i >= 0; i--) {
    const previous =
      i === 0 ? { x: start.x, y: start.y } : { x: segments[i - 1].x, y: segments[i - 1].y };
    const segment = segments[i];
    if (segment.kind === 'L') reversed.push({ t: 'L', x: previous.x, y: previous.y });
    else reversed.push({ t: 'Q', x1: segment.cx, y1: segment.cy, x: previous.x, y: previous.y });
  }
  reversed.push({ t: 'Z' });
  return reversed;
}

/** Positive area is counter-clockwise in y-up font space. */
export function orient(commands: Cmd[], positive: boolean): Cmd[] {
  const area = signedArea(commands);
  if (Math.abs(area) < 1e-6) return commands;
  if (area > 0 !== positive) return reverseContour(commands);
  return commands;
}

export function boundsOf(commands: Cmd[]): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const command of commands) {
    if (command.t === 'M' || command.t === 'L') add(command.x, command.y);
    else if (command.t === 'Q') {
      add(command.x1, command.y1);
      add(command.x, command.y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

export function shiftX(commands: Cmd[], dx: number): Cmd[] {
  return commands.map((command) => {
    if (command.t === 'M' || command.t === 'L') return { ...command, x: command.x + dx };
    if (command.t === 'Q') return { ...command, x1: command.x1 + dx, x: command.x + dx };
    return command;
  });
}
