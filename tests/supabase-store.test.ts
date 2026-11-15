import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SupabaseStore, type Upload } from '../server/supabase';
import type { FontRow } from '../server/db';

const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const upload: Upload = { id, font_id: id, owner_id: 'alice', state: 'processing', expected_version: null,
  created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 130 * 60_000).toISOString(), previous_font_path: null, previous_project_path: null };
const row: FontRow = { id, owner_id: 'alice', owner_name: 'Alice', name: 'Cloud brush', designer: '', visibility: 'private', glyph_count: 1, size: 1000, created_at: 1, updated_at: 1, editable: 1 };
beforeEach(() => { vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co'); vi.stubEnv('SUPABASE_SECRET_KEY', 'test-server-secret'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test('Supabase SDK creates scoped non-overwriting staging URLs and keeps the service key server-side', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => Response.json({ url: `${new URL(String(url)).pathname.replace('/storage/v1', '')}?token=object-only` }));
  vi.stubGlobal('fetch', fetch);
  const urls = await new SupabaseStore().signedUploads(upload);
  expect(urls.font).toBe(`https://project.supabase.co/storage/v1/object/upload/sign/handpress/staging/${id}/font?token=object-only`);
  expect(urls.project).toContain(`/staging/${id}/project?token=object-only`);
  expect(JSON.stringify(urls)).not.toContain('test-server-secret');
  for (const [, init] of fetch.mock.calls) {
    expect(new Headers(init?.headers).get('apikey')).toBe('test-server-secret');
    expect(new Headers(init?.headers).get('x-upsert')).not.toBe('true');
  }
});

test('validated objects are written to different immutable paths before metadata is committed', async () => {
  const order: string[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    const path = new URL(String(input)).pathname; order.push(path);
    if (path.includes('/storage/v1/object/')) return Response.json({ Key: 'ok' });
    if (path.includes('rpc/handpress_commit_upload')) return Response.json(true);
    if (path.includes('/handpress_fonts')) return Response.json({ ...row, version: id });
    throw new Error('Unexpected request');
  });
  vi.stubGlobal('fetch', fetch);
  const result = await new SupabaseStore().finish(upload, row, new Uint8Array([1, 2]), '{}');
  expect(result.version).toBe(id);
  expect(order.slice(0, 2)).toEqual([`/storage/v1/object/handpress/saved/${id}/font`, `/storage/v1/object/handpress/saved/${id}/project`]);
  expect(order[2]).toBe('/rest/v1/rpc/handpress_commit_upload');
  for (const [, init] of fetch.mock.calls.slice(0, 2)) expect(new Headers(init?.headers).get('x-upsert')).toBe('false');
});

test('an immutable-object write failure cannot commit metadata', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ message: 'Storage quota exceeded' }, { status: 413 }));
  vi.stubGlobal('fetch', fetch);
  await expect(new SupabaseStore().finish(upload, row, new Uint8Array([1]), '{}')).rejects.toMatchObject({ status: 503 });
  expect(fetch.mock.calls.some(([url]) => String(url).includes('commit_upload'))).toBe(false);
});

test('reserve handles PostgREST composite results and translates quota errors without exposing internals', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => String(input).includes('rpc/handpress_reserve_upload') ? Response.json([upload]) : Response.json([]));
  vi.stubGlobal('fetch', fetch);
  await expect(new SupabaseStore().reserve('alice', null)).resolves.toEqual(upload);
  fetch.mockImplementation(async (input) => String(input).includes('rpc/handpress_reserve_upload')
    ? Response.json({ message: 'FONT_LIMIT secret internal details' }, { status: 400 }) : Response.json([]));
  await expect(new SupabaseStore().reserve('alice', null)).rejects.toMatchObject({ status: 409, message: 'You can keep up to 50 fonts. Delete one to save another.' });
});

test('health requires a private bucket and installed schema; missing configuration fails closed', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>(async (input) => String(input).includes('/storage/v1/bucket/')
    ? Response.json({ id: 'handpress', name: 'handpress', public: true, file_size_limit: 12582912 }) : Response.json([])));
  await expect(new SupabaseStore().health()).rejects.toMatchObject({ status: 503 });
  vi.stubEnv('SUPABASE_SECRET_KEY', '');
  expect(() => new SupabaseStore()).toThrow('has not been configured');
});
