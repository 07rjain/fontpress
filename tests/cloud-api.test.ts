import { beforeEach, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CHARSET } from '../src/spec';
import { fontFixture, projectFixture } from './fixtures';
import type { FontRow } from '../server/db';
import type { Upload } from '../server/supabase';

vi.mock('../server/auth', () => ({
  userIdFrom: async (header: string) => header === 'Bearer alice' ? 'alice' : header === 'Bearer bob' ? 'bob' : null,
  displayName: async () => 'Alice',
}));
// Exercise HTTP authentication, validation and completion against the cloud store boundary.
// Actual Postgres functions and Supabase SDK requests have separate tests.
const state = vi.hoisted(() => ({
  rows: new Map<string, FontRow>(), uploads: new Map<string, Upload>(),
  staged: new Map<string, { bytes: Uint8Array; project: string }>(),
  contents: new Map<string, { font_data: Buffer; project_json: string }>(),
}));
vi.mock('../server/store', async () => {
  const { StorageError } = await import('../server/supabase');
  const store = {
    health: vi.fn(async () => {}),
    reserve: vi.fn(async (owner: string, id: string | null) => {
      const row = id ? state.rows.get(id) : null;
      if (id && row?.owner_id !== owner) throw new StorageError('Font not found.', 404);
      const uploadId = randomUUID();
      const upload: Upload = { id: uploadId, font_id: id ?? uploadId, owner_id: owner, expected_version: row?.version ?? null,
        state: 'pending', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 130 * 60_000).toISOString(),
        previous_font_path: null, previous_project_path: null };
      state.uploads.set(uploadId, upload); return upload;
    }),
    signedUploads: vi.fn(async (upload: Upload) => ({ font: `https://storage.example/staging/${upload.id}/font`, project: `https://storage.example/staging/${upload.id}/project` })),
    findUpload: vi.fn(async (id: string, owner: string) => { const upload = state.uploads.get(id); return upload?.owner_id === owner ? { ...upload } : undefined; }),
    claim: vi.fn(async (upload: Upload) => {
      const current = state.uploads.get(upload.id)!;
      if (current.state !== 'pending' || Date.parse(current.created_at) < Date.now() - 15 * 60_000) throw new StorageError('Upload expired or already saved.', 409);
      current.state = 'processing';
    }),
    readStaged: vi.fn(async (upload: Upload) => state.staged.get(upload.id)!),
    fail: vi.fn(async (upload: Upload) => { state.uploads.get(upload.id)!.state = 'failed'; }),
    finish: vi.fn(async (upload: Upload, row: FontRow, bytes: Uint8Array, project: string) => {
      if (state.rows.get(upload.font_id)?.version !== (upload.expected_version ?? undefined)) throw new StorageError('The saved font changed.', 409);
      const saved = { ...row, version: upload.id }; state.rows.set(row.id, saved);
      state.contents.set(row.id, { font_data: Buffer.from(bytes), project_json: project });
      state.uploads.get(upload.id)!.state = 'complete'; return saved;
    }),
    get: vi.fn(async (id: string) => state.rows.get(id)),
    content: vi.fn(async (id: string) => state.contents.get(id)),
    publicPage: vi.fn(async () => ({ fonts: [...state.rows.values()].filter((row) => row.visibility === 'public'), total: [...state.rows.values()].filter((row) => row.visibility === 'public').length })),
    byOwner: vi.fn(async (owner: string) => [...state.rows.values()].filter((row) => row.owner_id === owner)),
    projectUrl: vi.fn(async () => 'https://storage.example/owner-only-project?token=short-lived'),
  };
  return { getStore: async () => store, cloudStore: async () => store, fonts: store };
});
const { app } = await import('../server/app');
beforeEach(() => { state.rows.clear(); state.uploads.clear(); state.staged.clear(); state.contents.clear(); });
function request(path: string, body?: unknown, owner = 'alice') {
  return app.request(path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function prepare(id: string | null = null, chars = CHARSET) {
  const response = await request('/api/uploads', { fontId: id }); expect(response.status).toBe(200);
  const upload = await response.json();
  state.staged.set(upload.uploadId, { bytes: new Uint8Array(fontFixture(chars)), project: JSON.stringify(projectFixture(chars)) });
  return upload as { uploadId: string; urls: { font: string; project: string } };
}
async function complete(id: string, visibility = 'private', owner = 'alice') {
  return request(`/api/uploads/${id}/complete`, { name: 'My brush', designer: 'Me', visibility }, owner);
}

test('cloud saves keep drawings private and validate the actual font before download or publication', async () => {
  const upload = await prepare(null, ['A']);
  expect(upload.urls.font).toContain('staging/');
  const response = await complete(upload.uploadId); expect(response.status).toBe(201);
  const { font } = await response.json(); expect(font.glyphCount).toBe(1);
  expect(font.version).toBeUndefined();
  expect(state.contents.get(font.id)?.project_json).toContain(`"libraryId":"${font.id}"`);
  expect((await request(`/api/fonts/${font.id}/file?download=1`)).status).toBe(400);
  expect((await request(`/api/fonts/${font.id}/file`, undefined, 'bob')).status).toBe(404);
  expect((await request(`/api/fonts/${font.id}/project`, undefined, 'bob')).status).toBe(404);
  const project = await request(`/api/fonts/${font.id}/project`);
  expect(project.headers.get('Cache-Control')).toBe('private, no-store');
  expect((await project.json()).projectUrl).toContain('short-lived');
  const malicious = await prepare(null, ['A']);
  expect((await complete(malicious.uploadId, 'public')).status).toBe(400);
  expect(state.rows.size).toBe(1);
});

test('upload ownership and authentication are required for reservation and completion', async () => {
  expect((await request('/api/uploads', { fontId: null }, '')).status).toBe(401);
  const upload = await prepare();
  expect((await complete(upload.uploadId, 'public', 'bob')).status).toBe(404);
  expect(state.uploads.get(upload.uploadId)?.state).toBe('pending');
  const response = await complete(upload.uploadId, 'public'); expect(response.status).toBe(201);
  const { font } = await response.json();
  expect((await request('/api/uploads', { fontId: font.id }, 'bob')).status).toBe(404);
  expect((await request(`/api/fonts/${font.id}/project`, undefined, 'bob')).status).toBe(404);
  expect((await request(`/api/fonts/${font.id}/file?download=1`, undefined, '')).status).toBe(200);
  expect((await request('/api/fonts/public', undefined, '')).status).toBe(200);
});

test('expired and consumed uploads cannot replace a saved font; completion retries are idempotent', async () => {
  const expired = await prepare();
  state.uploads.get(expired.uploadId)!.created_at = new Date(Date.now() - 16 * 60_000).toISOString();
  expect((await complete(expired.uploadId)).status).toBe(409);
  const upload = await prepare();
  const first = await complete(upload.uploadId, 'public'); const saved = (await first.json()).font;
  state.staged.set(upload.uploadId, { bytes: new Uint8Array(fontFixture(['A'])), project: JSON.stringify(projectFixture(['A'])) });
  const retry = await complete(upload.uploadId); expect(retry.status).toBe(200);
  expect((await retry.json()).font).toEqual(saved);
  expect(state.rows.get(saved.id)?.glyph_count).toBe(85);
});

test('invalid updates preserve the previous saved font; a stale update cannot overwrite a newer save', async () => {
  const first = await prepare(); const saved = (await (await complete(first.uploadId)).json()).font;
  const invalid = await prepare(saved.id);
  state.staged.get(invalid.uploadId)!.project = JSON.stringify({ glyphs: { A: { image: 'not-a-png' } } });
  expect((await complete(invalid.uploadId)).status).toBe(400);
  expect(state.rows.get(saved.id)?.version).toBe(first.uploadId);
  const older = await prepare(saved.id); const newer = await prepare(saved.id);
  expect((await complete(newer.uploadId)).status).toBe(200);
  expect((await complete(older.uploadId)).status).toBe(409);
  expect(state.rows.get(saved.id)?.version).toBe(newer.uploadId);
});

test('large finalize requests are rejected before any upload is claimed', async () => {
  const upload = await prepare();
  const response = await request(`/api/uploads/${upload.uploadId}/complete`, { name: 'x'.repeat(20 * 1024) });
  expect(response.status).toBe(413);
  expect(state.uploads.get(upload.uploadId)?.state).toBe('pending');
});
