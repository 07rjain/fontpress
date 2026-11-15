// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { PublicSite } from '../src/components/PublicSite';
import { SiteRouter } from '../src/SiteRouter';
import { PUBLIC_PAGES } from '../src/seo';

vi.mock('../src/api', async (original) => ({ ...await original<typeof import('../src/api')>(), listPublicFonts: vi.fn(async () => []) }));
vi.mock('../src/StudioApp', () => ({ default: () => <div data-testid="studio">Private studio</div> }));
let hydrated: Root | undefined;
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  document.head.innerHTML = '<meta name="robots" content="index,follow">';
});
afterEach(() => {
  if (hydrated) { act(() => hydrated!.unmount()); hydrated = undefined; }
  cleanup(); document.body.innerHTML = '';
});

test('public content hydrates without authentication, exposes FAQ answers, and keeps the SEO title', async () => {
  document.body.innerHTML = `<div id="test-root">${renderToString(<PublicSite path="/" />)}</div>`;
  const onRecoverableError = vi.fn();
  await act(async () => { hydrated = hydrateRoot(document.getElementById('test-root')!, <SiteRouter />, { onRecoverableError }); });
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Turn your handwriting into a font.');
  expect(screen.getByText('Is Handpress free? Do I need an account?')).toBeTruthy();
  expect(screen.queryByTestId('studio')).toBeNull();
  expect(document.title).toBe(PUBLIC_PAGES['/'].title);
  expect(onRecoverableError).not.toHaveBeenCalled();
});

test('studio hash navigation and returning home preserve the correct public/private boundary', async () => {
  render(<SiteRouter />);
  await act(async () => { window.location.hash = '/draw'; });
  await screen.findByTestId('studio');
  await act(async () => {
    window.history.pushState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await screen.findByRole('heading', { level: 1, name: 'Turn your handwriting into a font.' });
  expect(screen.queryByTestId('studio')).toBeNull();
  expect(document.title).toBe(PUBLIC_PAGES['/'].title);
  await act(async () => { window.location.hash = 'main-content'; });
  expect(screen.queryByTestId('studio')).toBeNull();
});

test('gallery failure is distinct from a genuinely empty collection', async () => {
  const { listPublicFonts } = await import('../src/api');
  vi.mocked(listPublicFonts).mockRejectedValueOnce(new Error('Server unavailable'));
  render(<PublicSite path="/" />);
  await screen.findByText(/Community fonts are temporarily unavailable/);
  expect(screen.queryByText('No public fonts yet')).toBeNull();
});

test('public guides show their own content and title without loading the studio', async () => {
  window.history.replaceState(null, '', '/install-font');
  render(<SiteRouter />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Install your handwriting font on Mac or Windows');
  expect(screen.queryByTestId('studio')).toBeNull();
  await waitFor(() => expect(document.title).toBe(PUBLIC_PAGES['/install-font'].title));
  fireEvent.click(screen.getByRole('link', { name: 'Skip to content' }));
  expect(screen.queryByTestId('studio')).toBeNull();
});
