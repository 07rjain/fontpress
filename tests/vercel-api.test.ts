import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

vi.mock('../server/auth', () => ({ userIdFrom: async (header: string) => header === 'Bearer alice' ? 'alice' : null, displayName: async () => 'Alice' }));
const nativeFetch = globalThis.fetch;
const unusedDataDir = join(tmpdir(), `handpress-must-not-use-sqlite-${randomUUID()}`);
let server: Server;
let origin: string;
let bucketPublic = false;
beforeAll(async () => {
  vi.stubEnv('VERCEL', '1'); vi.stubEnv('DATA_DIR', unusedDataDir);
  vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co'); vi.stubEnv('SUPABASE_SECRET_KEY', 'test-server-secret');
  // Real Node HTTP -> deployed adapter -> real Hono routes -> real SDK -> stubbed Supabase transport.
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (url, init) => {
    const target = new URL(String(url));
    if (target.pathname === '/rest/v1/rpc/handpress_public_page') return Response.json({ fonts: [], total: 0 });
    if (target.pathname === '/storage/v1/bucket/handpress') return Response.json({ public: bucketPublic, file_size_limit: 12582912 });
    if (target.pathname === '/rest/v1/handpress_uploads') return Response.json([]);
    if (target.pathname === '/rest/v1/rpc/handpress_reserve_upload') {
      const body = JSON.parse(String(init?.body));
      return Response.json({ id: body.p_upload_id, owner_id: body.p_owner, font_id: body.p_upload_id, state: 'pending', expected_version: null });
    }
    if (target.pathname.startsWith('/storage/v1/object/upload/sign/')) return Response.json({ url: `${target.pathname.replace('/storage/v1', '')}?token=object-token` });
    throw new Error(`Unexpected request: ${target.pathname}`);
  }));
  const { default: handler } = await import('../api/[...path]');
  server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test address');
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  vi.unstubAllEnvs(); vi.unstubAllGlobals();
});

test('the Vercel entry serves real JSON APIs, preserves nested paths, and never opens SQLite', async () => {
  const health = await nativeFetch(`${origin}/api/health`); expect(health.status).toBe(200); expect(await health.json()).toEqual({ ok: true });
  const publicFonts = await nativeFetch(`${origin}/api/fonts/public?q=brush&page=2`);
  expect(publicFonts.headers.get('Content-Type')).toContain('application/json');
  expect(await publicFonts.json()).toEqual({ fonts: [], total: 0, page: 2, pageSize: 24 });
  expect((await nativeFetch(`${origin}/api/fonts/mine`)).status).toBe(401);
  expect((await nativeFetch(`${origin}/api/unknown`)).status).toBe(404);
  expect(existsSync(unusedDataDir)).toBe(false);
});

test('JSON request bodies reach the upload route through the deployed Node adapter', async () => {
  const response = await nativeFetch(`${origin}/api/uploads`, { method: 'POST', headers: { Authorization: 'Bearer alice', 'Content-Type': 'application/json' }, body: JSON.stringify({ fontId: null }) });
  expect(response.status).toBe(200);
  const result = await response.json(); expect(result.mode).toBe('direct');
  expect(result.urls.project).toContain(`/staging/${result.uploadId}/project?token=object-token`);
  expect(JSON.stringify(result)).not.toContain('test-server-secret');
});

test('health reports setup failures instead of claiming that an unsafe public bucket is ready', async () => {
  bucketPublic = true;
  const response = await nativeFetch(`${origin}/api/health`);
  expect(response.status).toBe(503);
  expect((await response.json()).ok).toBeUndefined();
});
