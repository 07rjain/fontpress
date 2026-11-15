import { afterEach, expect, test, vi } from 'vitest';
import { ApiError, searchPublicFonts, listMyFonts } from '../src/api';

afterEach(() => vi.unstubAllGlobals());

test('a Vercel text 404 reports a service failure instead of a generic error or an empty gallery', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('The page could not be found\nNOT_FOUND', { status: 404 })));
  await expect(searchPublicFonts('', 1)).rejects.toMatchObject({ status: 404, message: 'The font service is temporarily unavailable. Please try again later.' });
});

test('a static-site HTML fallback cannot masquerade as a successful API response', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Handpress</html>', { headers: { 'Content-Type': 'text/html' } })));
  await expect(searchPublicFonts('', 1)).rejects.toBeInstanceOf(ApiError);
});

test('a valid empty response is a successful gallery result and preserves the query', async () => {
  const result = { fonts: [], total: 0, page: 1, pageSize: 24 };
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(result));
  vi.stubGlobal('fetch', fetch);
  await expect(searchPublicFonts('brush & ink', 1)).resolves.toEqual(result);
  expect(fetch.mock.calls[0]?.[0]).toBe('/api/fonts/public?q=brush+%26+ink&page=1');
});

test('API error messages and authorization are preserved', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ error: 'Sign in to continue.' }, { status: 401 }));
  vi.stubGlobal('fetch', fetch);
  await expect(listMyFonts(async () => 'session-token')).rejects.toMatchObject({ status: 401, message: 'Sign in to continue.' });
  const request = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(new Headers(request[1].headers).get('Authorization')).toBe('Bearer session-token');
});

test('cloud saves send large drawings straight to Storage and keep Clerk credentials on the API', async () => {
  const { saveFont } = await import('../src/api');
  const { emptyProject } = await import('../src/project');
  const project = emptyProject();
  // Verify a payload larger than a Vercel function accepts without requiring a giant font fixture.
  project.glyphs.A.image = `data:image/png;base64,${'A'.repeat(5 * 1024 * 1024)}`;
  const saved = { id: 'font-id', name: 'Cloud font' };
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
    if (url === '/api/uploads') return Response.json({ mode: 'direct', uploadId: 'upload-id', urls: { font: 'https://storage.example/font?token=font', project: 'https://storage.example/project?token=project' } });
    if (String(url).startsWith('https://storage.example/')) return Response.json({ Key: 'ok' });
    if (url === '/api/uploads/upload-id/complete') return Response.json({ font: saved });
    throw new Error('Unexpected request');
  });
  vi.stubGlobal('fetch', fetch);
  await expect(saveFont(async () => 'clerk-session', { id: null, name: 'Cloud font', designer: '', visibility: 'private', buffer: new ArrayBuffer(100), project })).resolves.toEqual(saved);
  expect(fetch).toHaveBeenCalledTimes(4);
  for (const [url, init] of fetch.mock.calls) {
    const auth = new Headers(init?.headers).get('Authorization');
    if (String(url).startsWith('/api/')) {
      expect(auth).toBe('Bearer clerk-session');
      expect(String(init?.body).length).toBeLessThan(1000);
    } else {
      expect(auth).toBeNull();
      expect(init?.method).toBe('PUT');
      expect(init?.credentials).toBe('omit');
    }
  }
  const source = fetch.mock.calls.find(([url]) => String(url).includes('/project?'));
  expect(String(source?.[1]?.body).length).toBeGreaterThan(4.5 * 1024 * 1024);
});

test('a failed object upload never finalizes or replaces a saved font', async () => {
  const { saveFont } = await import('../src/api');
  const { emptyProject } = await import('../src/project');
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => url === '/api/uploads'
    ? Response.json({ mode: 'direct', uploadId: 'upload-id', urls: { font: 'https://storage.example/font', project: 'https://storage.example/project' } })
    : Response.json({ error: 'Storage unavailable.' }, { status: 503 }));
  vi.stubGlobal('fetch', fetch);
  await expect(saveFont(async () => 'session', { id: 'existing', buffer: new ArrayBuffer(100), name: 'Test', designer: '', visibility: 'private', project: emptyProject() })).rejects.toBeInstanceOf(ApiError);
  expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/complete'))).toBe(false);
});

test('saved drawings are fetched from the owner-authorized URL without forwarding the session', async () => {
  const { fetchFontProject } = await import('../src/api');
  const { emptyProject } = await import('../src/project');
  const project = emptyProject();
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => url === '/api/fonts/font-id/project'
    ? Response.json({ projectUrl: 'https://storage.example/project?token=temporary' }) : Response.json(project));
  vi.stubGlobal('fetch', fetch);
  await expect(fetchFontProject(async () => 'clerk-session', 'font-id')).resolves.toEqual(project);
  expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer clerk-session');
  expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get('Authorization')).toBeNull();
});
