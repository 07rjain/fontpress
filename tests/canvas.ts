import { createCanvas, Image, type Canvas } from '@napi-rs/canvas';
import { vi } from 'vitest';

/** Use a real raster canvas so stroke/import/export checks inspect actual pixels. */
export function installCanvas() {
  const canvases = new WeakMap<HTMLCanvasElement, Canvas>();
  function native(element: HTMLCanvasElement) {
    let canvas = canvases.get(element);
    if (!canvas || canvas.width !== element.width || canvas.height !== element.height) {
      canvas = createCanvas(element.width, element.height);
      const ctx = canvas.getContext('2d');
      const draw = ctx.drawImage.bind(ctx);
      ctx.drawImage = ((source: unknown, ...args: number[]) => {
        const bitmap = source instanceof HTMLCanvasElement ? native(source) : source;
        return Reflect.apply(draw, ctx, [bitmap, ...args]);
      }) as typeof ctx.drawImage;
      canvases.set(element, canvas);
    }
    return canvas;
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return native(this).getContext('2d') as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
    return native(this).toDataURL('image/png');
  });
  vi.stubGlobal('Image', Image);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, options: PointerEventInit = {}) { super(type, options); this.pointerId = options.pointerId ?? 1; }
  });
}
