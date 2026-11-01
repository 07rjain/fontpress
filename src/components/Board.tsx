import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  createMask,
  maskContext,
  maskToUrl,
  paintGuides,
  paintUrl,
  strokeOn,
} from '../draw';
import { glyphPixelSize } from '../spec';
import type { Point, Tool } from '../types';

type Props = {
  char: string;
  label: string;
  image: string | null;
  tool: Tool;
  width: number;
  offsetX?: number;
  onCommit: (image: string | null) => void;
  onFile: (file: File) => void;
  aside?: ReactNode;
};

export function Board({ char, label, image, tool, width, offsetX = 0, onCommit, onFile, aside }: Props) {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const loadedKey = useRef('');
  const propsRef = useRef({ char, tool, width, offsetX, onCommit });
  propsRef.current = { char, tool, width, offsetX, onCommit };
  const live = useRef<{
    pointerId: number; points: Point[]; erase: boolean; char: string; width: number;
    mask: HTMLCanvasElement; before: HTMLCanvasElement; onCommit: Props['onCommit'];
  } | null>(null);
  const cursor = useRef<Point | null>(null);
  const [ready, setReady] = useState(false);
  const { w: maskW, h: maskH, aspect } = glyphPixelSize();

  function paint() {
    const view = viewRef.current;
    const mask = maskRef.current;
    if (!view || !mask) return;
    const rect = view.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelW = Math.round(rect.width * dpr);
    const pixelH = Math.round(rect.height * dpr);
    if (view.width !== pixelW || view.height !== pixelH) {
      view.width = pixelW;
      view.height = pixelH;
    }
    const ctx = view.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#fbf7ef';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(mask, (propsRef.current.offsetX / maskW) * rect.width, 0, rect.width, rect.height);
    const gesture = live.current;
    if (gesture && !gesture.erase && gesture.points.length > 0) {
      ctx.save();
      ctx.scale(rect.width / maskW, rect.height / maskH);
      ctx.translate(propsRef.current.offsetX, 0);
      strokeOn(ctx, gesture.points, gesture.width, false);
      ctx.restore();
    }
    ctx.restore();
    paintGuides(ctx, rect.width, rect.height, propsRef.current.char);
    const ring = cursor.current;
    if (ring && propsRef.current.tool === 'eraser') {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(28, 25, 22, 0.7)';
      ctx.lineWidth = 1.5;
      const radius = ((propsRef.current.width * 2.7) / 2) * (rect.width / maskW);
      ctx.arc(((ring.x + propsRef.current.offsetX) / maskW) * rect.width, (ring.y / maskH) * rect.height, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  useEffect(() => {
    const key = `${char}::${image ?? ''}`;
    if (loadedKey.current === key && maskRef.current) {
      setReady(true);
      paint();
      return;
    }
    live.current = null;
    cursor.current = null;
    setReady(false);
    const mask = createMask();
    maskRef.current = mask;
    paint();
    let cancel = false;
    void (async () => {
      if (image) {
        try {
          await paintUrl(mask, image);
        } catch {
          maskContext(mask).clearRect(0, 0, mask.width, mask.height);
        }
      }
      if (cancel) return;
      loadedKey.current = key;
      setReady(true);
      paint();
    })();
    return () => {
      cancel = true;
    };
    // paint is recreated each render and reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char, image]);

  useEffect(() => { paint(); }, [offsetX, tool, width]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const observer = new ResizeObserver(() => paint());
    observer.observe(view);
    return () => observer.disconnect();
  }, [char]);

  function toMask(event: { clientX: number; clientY: number }): Point {
    const rect = viewRef.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * maskW - propsRef.current.offsetX,
      y: ((event.clientY - rect.top) / rect.height) * maskH,
    };
  }

  function addPoint(points: Point[], point: Point) {
    const last = points[points.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= 1.3) points.push(point);
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!ready || !maskRef.current || live.current) return;
    if (event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers reject capture for a pointer that is already released.
    }
    const point = toMask(event);
    const before = createMask();
    maskContext(before).drawImage(maskRef.current, 0, 0);
    live.current = {
      pointerId: event.pointerId,
      points: [point],
      erase: propsRef.current.tool === 'eraser',
      char,
      width,
      mask: maskRef.current,
      before,
      onCommit,
    };
    cursor.current = point;
    if (live.current.erase) {
      strokeOn(maskContext(maskRef.current), [point], propsRef.current.width, true);
    }
    paint();
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!maskRef.current) return;
    const gesture = live.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      cursor.current = toMask(event);
      if (propsRef.current.tool === 'eraser') paint();
      return;
    }
    const before = gesture.points.length;
    const samples: PointerEvent[] = [];
    try {
      const coalesced = event.nativeEvent.getCoalescedEvents?.();
      if (coalesced) {
        for (const sample of coalesced) samples.push(sample);
      }
    } catch {
      // Some browsers throw for a pointer that is no longer active.
    }
    samples.push(event.nativeEvent);
    for (const sample of samples) addPoint(gesture.points, toMask(sample));
    cursor.current = gesture.points[gesture.points.length - 1] ?? null;
    if (gesture.erase) {
      const from = Math.max(0, before - 1);
      strokeOn(maskContext(gesture.mask), gesture.points.slice(from), gesture.width, true);
    }
    paint();
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const gesture = live.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.char !== propsRef.current.char || gesture.mask !== maskRef.current) {
      cancelGesture();
      return;
    }
    addPoint(gesture.points, toMask(event));
    if (!gesture.erase && gesture.points.length > 0) {
      strokeOn(maskContext(gesture.mask), gesture.points, gesture.width, false);
    }
    live.current = null;
    const result = maskToUrl(gesture.mask);
    const key = `${gesture.char}::${result ?? ''}`;
    loadedKey.current = key;
    gesture.onCommit(result);
    paint();
  }

  function cancelGesture(event?: React.PointerEvent<HTMLCanvasElement>) {
    const gesture = live.current;
    if (!gesture || (event && gesture.pointerId !== event.pointerId)) return;
    if (gesture.mask === maskRef.current) maskRef.current = gesture.before;
    live.current = null;
    cursor.current = null;
    paint();
  }

  return (
    <div className="board-card">
      <div className="board-head">
        <div>
          <h2>{label}</h2>
          <p>Sit the letter on the red line. The grey lines are only guides.</p>
        </div>
        {aside}
      </div>
      <canvas
        ref={viewRef}
        className={tool === 'eraser' ? 'board eraser' : 'board'}
        style={{ aspectRatio: `${aspect}` }}
        tabIndex={0}
        role="application"
        aria-label={`Drawing surface for ${label}`}
        aria-busy={!ready}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancelGesture}
        onLostPointerCapture={cancelGesture}
        onPointerLeave={() => {
          cursor.current = null;
          paint();
        }}
        onContextMenu={(event) => event.preventDefault()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) onFile(file);
        }}
      />
    </div>
  );
}
