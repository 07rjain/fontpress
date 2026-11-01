import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { CHARSET } from '../src/spec';
import { fontFixture, projectFixture } from './fixtures';
import type { Project } from '../src/types';

// The API is exercised after the external identity-verification boundary.
vi.mock('../server/auth', () => ({
  userIdFrom: async (header: string) => header === 'Bearer alice' ? 'alice' : header === 'Bearer bob' ? 'bob' : null,
  displayName: async (id: string) => id === 'alice' ? 'Alice' : 'Bob',
}));
let dir: string;
let db: Database.Database;
let app: typeof import('../server/app')['app'];
const fullFont = fontFixture(CHARSET);
const fullProject = projectFixture(CHARSET);

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'handpress-api-test-'));
  vi.stubEnv('DATA_DIR', dir);
  db = new Database(join(dir, 'handpress.db'));
  // Start with the shipped schema to exercise the additive migration itself.
  db.exec(`create table fonts (id text primary key, owner_id text not null, owner_name text not null,
    name text not null, designer text not null, visibility text not null,
    glyph_count integer not null, size integer not null, created_at integer not null, updated_at integer not null)`);
  ({ app } = await import('../server/app'));
});
beforeEach(() => { db.exec('delete from fonts'); });
afterAll(async () => { db.close(); await rm(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); });

function upload(bytes: ArrayBuffer = fullFont, project: Project = fullProject, visibility = 'private', name = 'Brush') {
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: 'font/otf' }), 'Brush.otf');
  form.set('project', JSON.stringify(project));
  form.set('name', name); form.set('designer', 'Designer'); form.set('visibility', visibility);
  return form;
}
function request(path: string, init: RequestInit = {}, owner = 'alice') {
  const headers = new Headers(init.headers);
  if (owner) headers.set('Authorization', `Bearer ${owner}`);
  return app.request(path, { ...init, headers });
}
async function create(bytes = fullFont, project = fullProject, visibility = 'private') {
  const response = await request('/api/fonts', { method: 'POST', body: upload(bytes, project, visibility) });
  expect(response.status).toBe(201);
  return (await response.json()).font;
}

test('private source and compiled font round-trip together; only the owner can reopen or update them', async () => {
  const source = projectFixture(['A'], 'Partial'); source.glyphs.A.offsetX = 20;
  const bytes = fontFixture(['A']);
  const font = await create(bytes, source);
  expect(font.glyphCount).toBe(1);
  expect(font.editable).toBe(true);
  expect((await request(`/api/fonts/${font.id}/project`, {}, '')).status).toBe(401);
  expect((await request(`/api/fonts/${font.id}/project`, {}, 'bob')).status).toBe(404);
  expect((await request(`/api/fonts/${font.id}/file`, {}, 'bob')).status).toBe(404);
  expect((await request(`/api/fonts/${font.id}`, { method: 'PUT', body: upload() }, 'bob')).status).toBe(404);
  const reopened = await request(`/api/fonts/${font.id}/project`);
  expect(reopened.headers.get('Cache-Control')).toBe('private, no-store');
  expect((await reopened.json()).project).toEqual({ ...source, libraryId: font.id });
  const downloaded = await request(`/api/fonts/${font.id}/file`);
  expect(downloaded.headers.get('Content-Type')).toBe('font/otf');
  expect(downloaded.headers.get('Content-Disposition')).toContain('Brush.otf');
  expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(new Uint8Array(bytes));
  const promotion = await request(`/api/fonts/${font.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visibility: 'public' }) });
  expect(promotion.status).toBe(400);
  const updated = await request(`/api/fonts/${font.id}`, { method: 'PUT', body: upload(fullFont, fullProject, 'public', 'Completed') });
  expect(updated.status).toBe(200);
  const publicFile = await request(`/api/fonts/${font.id}/file`, {}, '');
  expect(publicFile.status).toBe(200);
  expect(new Uint8Array(await publicFile.arrayBuffer())).toEqual(new Uint8Array(fullFont));
  const publicList = await (await request('/api/fonts/public', {}, '')).json();
  expect(publicList.fonts).toHaveLength(1);
  expect(publicList.fonts[0].name).toBe('Completed');
  expect(JSON.stringify(publicList)).not.toContain('data:image');
  expect((await request(`/api/fonts/${font.id}/project`, {}, 'bob')).status).toBe(404);
  const updatedSource = await (await request(`/api/fonts/${font.id}/project`)).json();
  expect(updatedSource.project.glyphs.z.image).toBe(fullProject.glyphs.z.image);
  expect((await request(`/api/fonts/${font.id}`, { method: 'DELETE' })).status).toBe(200);
  expect((await request(`/api/fonts/${font.id}/file`)).status).toBe(404);
  expect((await request(`/api/fonts/${font.id}/project`)).status).toBe(404);
});

test.each([
  ['blank supported glyphs', () => fontFixture(CHARSET, true)],
  ['unrelated Unicode glyphs', () => fontFixture(CHARSET.map((_, i) => String.fromCodePoint(0xe000 + i)))],
  ['a missing required character replaced by an unrelated glyph', () => fontFixture([...CHARSET.slice(1), '\ue000'])],
  ['a partial alphabet', () => fontFixture(['A'])],
] as const)('publishing rejects %s', async (_label, makeBytes) => {
  const response = await request('/api/fonts', { method: 'POST', body: upload(makeBytes(), fullProject, 'public') });
  expect(response.status).toBe(400);
  expect(db.prepare('select count(*) as n from fonts').get()).toEqual({ n: 0 });
});

test('invalid source cannot replace the last valid saved font and drawings', async () => {
  const font = await create();
  const invalid = projectFixture(); invalid.glyphs.A.image = 'data:image/svg+xml,<svg/>';
  const response = await request(`/api/fonts/${font.id}`, { method: 'PUT', body: upload(fontFixture(['A']), invalid) });
  expect(response.status).toBe(400);
  const source = await (await request(`/api/fonts/${font.id}/project`)).json();
  expect(source.project.glyphs.z.image).toBe(fullProject.glyphs.z.image);
  const bytes = await (await request(`/api/fonts/${font.id}/file`)).arrayBuffer();
  expect(new Uint8Array(bytes)).toEqual(new Uint8Array(fullFont));
});

test('gallery pagination reaches beyond 120 entries and search never includes private fonts', async () => {
  const insert = db.prepare(`insert into fonts (id, owner_id, owner_name, name, designer, visibility, glyph_count, size, created_at, updated_at)
    values (?, 'alice', 'Alice', ?, 'Designer', ?, 85, 1234, 1, ?)`);
  for (let i = 0; i < 125; i++) insert.run(`00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, i === 124 ? 'SpecialBrush' : `Font ${i}`, 'public', i);
  insert.run(randomUUID(), 'SpecialBrush private', 'private', 200);
  const all = [];
  for (let page = 1; page <= 6; page++) {
    const result = await (await request(`/api/fonts/public?page=${page}`, {}, '')).json();
    expect(result.total).toBe(125);
    expect(result.pageSize).toBe(24);
    all.push(...result.fonts);
  }
  expect(all).toHaveLength(125);
  expect(new Set(all.map((font) => font.id)).size).toBe(125);
  expect(all[0].name).toBe('SpecialBrush');
  const search = await (await request('/api/fonts/public?q=specialbrush', {}, '')).json();
  expect(search.total).toBe(1);
  expect(search.fonts[0].name).toBe('SpecialBrush');
  const literal = await (await request('/api/fonts/public?q=%25', {}, '')).json();
  expect(literal.total).toBe(0);
});

test('concurrent creates cannot exceed the account limit', async () => {
  const insert = db.prepare(`insert into fonts (id, owner_id, owner_name, name, designer, visibility, glyph_count, size, created_at, updated_at)
    values (?, 'alice', 'Alice', 'Fixture', '', 'private', 85, 1234, 1, 1)`);
  for (let i = 0; i < 49; i++) insert.run(randomUUID());
  const responses = await Promise.all([request('/api/fonts', { method: 'POST', body: upload() }), request('/api/fonts', { method: 'POST', body: upload() })]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  expect(db.prepare("select count(*) as n from fonts where owner_id = 'alice'").get()).toEqual({ n: 50 });
});

test('legacy file-backed entries survive the database migration and retain source recovery signaling', async () => {
  const id = randomUUID();
  db.prepare(`insert into fonts (id, owner_id, owner_name, name, designer, visibility, glyph_count, size, created_at, updated_at)
    values (?, 'alice', 'Alice', 'Legacy', '', 'private', 85, ?, 1, 1)`).run(id, fullFont.byteLength);
  await mkdir(join(dir, 'fonts'), { recursive: true });
  await writeFile(join(dir, 'fonts', `${id}.ttf`), new Uint8Array(fullFont));
  const response = await request(`/api/fonts/${id}/file`);
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toBe('font/otf');
  expect(response.headers.get('Content-Disposition')).toContain('Legacy.otf');
  expect((await request(`/api/fonts/${id}/project`)).status).toBe(409);
});
