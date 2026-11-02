// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ClerkProvider } from '@clerk/react';
import { App } from '../src/App';

// Keep the real provider and SDK loader. jsdom intentionally never downloads its remote script.
afterEach(() => {
  cleanup();
  document.querySelectorAll('script[data-clerk-publishable-key]').forEach((script) => script.remove());
  vi.useRealTimers();
});

test('a Clerk script that never loads produces an actionable error instead of an endless boot screen', async () => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const key = `pk_test_${btoa('unreachable.clerk.accounts.dev$')}`;
  render(<ClerkProvider publishableKey={key}><App /></ClerkProvider>);
  expect(screen.queryByRole('alert')).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  const script = document.querySelector<HTMLScriptElement>('script[data-clerk-publishable-key]');
  expect(script?.src).toBe('https://unreachable.clerk.accounts.dev/npm/@clerk/clerk-js@6/dist/clerk.browser.js');
  await act(async () => { await vi.advanceTimersByTimeAsync(15_001); });
  expect(screen.getByRole('alert').textContent).toContain('We couldn’t connect to sign-in');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  expect(screen.queryByRole('application')).toBeNull();
  expect(screen.queryByText('Handpress', { exact: true })).toBeNull();
});
