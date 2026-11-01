// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Gallery } from '../src/components/Gallery';
import { searchPublicFonts } from '../src/api';
import type { FontPage, SavedFont } from '../src/api';

vi.mock('../src/api', async (original) => ({ ...await original<typeof import('../src/api')>(), searchPublicFonts: vi.fn(), fetchFontFile: vi.fn(async () => new ArrayBuffer(4)) }));
function page(name: string, number = 1): FontPage {
  const font: SavedFont = { id: name, name, designer: 'Designer', ownerName: 'Owner', visibility: 'public', glyphCount: 85,
    size: 100, createdAt: 1, updatedAt: 1, editable: true };
  return { fonts: [font], total: 25, page: number, pageSize: 24 };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('FontFace', class { async load() { return this; } });
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add() {}, delete() {} } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('search survives page navigation and a slow old search cannot replace newer results', async () => {
  let resolveOld!: (value: FontPage) => void;
  const oldSearch = new Promise<FontPage>((resolve) => { resolveOld = resolve; });
  vi.mocked(searchPublicFonts).mockImplementation(async (query, number) => query === 'old'
    ? oldSearch : page(query ? `${query} page ${number}` : 'Initial', number));
  render(<Gallery onDownload={vi.fn()} onStart={vi.fn()} />);
  await screen.findByRole('heading', { name: 'Initial' });
  const input = screen.getByRole('searchbox');
  fireEvent.change(input, { target: { value: 'old' } });
  fireEvent.submit(screen.getByRole('search'));
  await waitFor(() => expect(searchPublicFonts).toHaveBeenCalledWith('old', 1));
  fireEvent.change(input, { target: { value: 'brush' } });
  fireEvent.submit(screen.getByRole('search'));
  await screen.findByRole('heading', { name: 'brush page 1' });
  await act(async () => { resolveOld(page('Stale old result')); });
  expect(screen.queryByText('Stale old result')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('heading', { name: 'brush page 2' });
  expect(searchPublicFonts).toHaveBeenLastCalledWith('brush', 2);
  expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
});
