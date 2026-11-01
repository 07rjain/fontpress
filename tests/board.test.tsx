// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { Board } from '../src/components/Board';
import { installCanvas } from './canvas';
import { letterPng } from './fixtures';
import { glyphPixelSize } from '../src/spec';

beforeEach(() => {
  installCanvas();
  const { w, h } = glyphPixelSize();
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0,
    right: w, bottom: h, width: w, height: h, toJSON() {} });
});
afterEach(cleanup);

async function pixel(url: string, x: number, y: number) {
  const image = await loadImage(url);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
  return ctx.getImageData(x, y, 1, 1).data[3];
}

test('a stroke cannot move into another character when the board changes letters', async () => {
  const a = vi.fn(), b = vi.fn();
  const props = { label: 'A', image: null, tool: 'pen' as const, width: 18, onFile: vi.fn() };
  const view = render(<Board {...props} char="A" onCommit={a} />);
  await act(async () => {});
  const canvas = screen.getByRole('application');
  fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 200, clientY: 200 });
  view.rerender(<Board {...props} char="B" onCommit={b} />);
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 200, clientY: 200 });
  expect(a).not.toHaveBeenCalled();
  expect(b).not.toHaveBeenCalled();
  fireEvent.pointerDown(canvas, { pointerId: 2, button: 0, clientX: 300, clientY: 100 });
  fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 300, clientY: 200 });
  expect(b).toHaveBeenCalledTimes(1);
  expect(await pixel(b.mock.calls[0][0], 150, 150)).toBe(0);
  expect(await pixel(b.mock.calls[0][0], 300, 150)).toBe(255);
});

test.each(['pointerCancel', 'lostPointerCapture'] as const)('%s rolls back erasing and allows a new gesture', async (event) => {
  const commit = vi.fn();
  render(<Board char="A" label="A" image={letterPng()} tool="eraser" width={18} onCommit={commit} onFile={vi.fn()} />);
  const canvas = screen.getByRole('application');
  await waitFor(() => expect(canvas.getAttribute('aria-busy')).toBe('false'));
  fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 150, clientY: 150 });
  fireEvent[event](canvas, { pointerId: 1 });
  fireEvent.pointerDown(canvas, { pointerId: 2, button: 0, clientX: 400, clientY: 200 });
  fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 400, clientY: 200 });
  expect(commit).toHaveBeenCalledTimes(1);
  expect(await pixel(commit.mock.calls[0][0], 150, 150)).toBe(255);
});
