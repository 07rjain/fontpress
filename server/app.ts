import { userIdFrom, displayName } from './auth.js';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { randomUUID } from 'node:crypto';
import { fonts, getStore, cloudStore, type FontRow, type Visibility } from './store.js';
import { StorageError } from './supabase.js';
import { inspectFont } from './inspect.js';
import { CHARSET, fontFileName } from '../src/spec.js';
import { readProjectUpload } from './project.js';
import { fontFormat } from '../src/fontFormat.js';
import { website } from './website.js';

const MAX_FONT_BYTES = 4 * 1024 * 1024;
const MAX_FONTS_PER_USER = 50;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Env = { Variables: { userId: string } };
export const app = new Hono<Env>();

function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function cleanVisibility(value: unknown): Visibility | null {
  return value === 'private' || value === 'public' ? value : null;
}

function toPublic(row: FontRow) {
  return {
    id: row.id,
    name: row.name,
    designer: row.designer,
    ownerName: row.owner_name,
    visibility: row.visibility,
    glyphCount: row.glyph_count,
    size: row.size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editable: Boolean(row.editable),
  };
}

function validateUpload(bytes: Uint8Array, body: Record<string, unknown>) {
  if (bytes.byteLength > MAX_FONT_BYTES) return { error: 'The font file is too large.' } as const;
  const inspected = inspectFont(bytes);
  if (!inspected) return { error: 'That file is not a font Handpress can store.' } as const;
  const visibility = cleanVisibility(body.visibility);
  if (!visibility) return { error: 'Choose private or public.' } as const;
  if (visibility === 'public' && inspected.missing.length > 0) {
    return { error: `Draw all ${CHARSET.length} characters before publishing. Missing: ${inspected.missing.join(' ')}` } as const;
  }
  const project = readProjectUpload(body.project);
  if (!project || inspected.covered.some((char) => !project.glyphs[char].image)) {
    return { error: 'Attach the editable drawings for this font.' } as const;
  }
  return {
    project,
    bytes,
    glyphCount: inspected.glyphCount,
    name: cleanText(body.name, 40) || 'My Hand',
    designer: cleanText(body.designer, 60),
    visibility,
  } as const;
}

async function readUpload(c: Context<Env>) {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return { error: 'Attach the font file.' } as const;
  return validateUpload(new Uint8Array(await file.arrayBuffer()), body);
}

async function ownedFont(c: Context<Env>): Promise<FontRow | null> {
  const id = c.req.param('id') ?? '';
  if (!ID_PATTERN.test(id)) return null;
  const row = await fonts.get(id);
  return row && row.owner_id === c.get('userId') ? row : null;
}

const requireUser = async (c: Context<Env>, next: () => Promise<void>) => {
  const userId = await userIdFrom(c.req.header('authorization') ?? '');
  if (!userId) return c.json({ error: 'Sign in to continue.' }, 401);
  c.header('Cache-Control', 'private, no-store');
  c.set('userId', userId);
  await next();
};

const uploadLimit = bodyLimit({
  maxSize: process.env.SUPABASE_URL ? 4 * 1024 * 1024 : 20 * 1024 * 1024,
  onError: (c) => c.json({ error: 'The font and drawings are too large.' }, 413),
});

app.onError((error, c) => {
  if (error instanceof StorageError) return c.json({ error: error.message }, error.status);
  console.error('Font service request failed:', error.name);
  return c.json({ error: 'The font service is temporarily unavailable. Please try again later.' }, 503);
});

app.get('/api/health', async (c) => {
  const store = await getStore();
  if ('health' in store) await store.health();
  else await store.publicPage('', 1, 0);
  c.header('Cache-Control', 'no-store');
  return c.json({ ok: true });
});

const jsonLimit = bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: 'The save request is too large.' }, 413) });
app.post('/api/uploads', requireUser, jsonLimit, async (c) => {
  const store = await cloudStore();
  if (!store) return c.json({ mode: 'multipart' });
  const body = await c.req.json().catch(() => null);
  if (!body || (body.fontId !== null && (typeof body.fontId !== 'string' || !ID_PATTERN.test(body.fontId)))) {
    return c.json({ error: 'Choose a valid font to save.' }, 400);
  }
  const upload = await store.reserve(c.get('userId'), body.fontId);
  return c.json({ mode: 'direct', uploadId: upload.id, urls: await store.signedUploads(upload) });
});

app.post('/api/uploads/:id/complete', requireUser, jsonLimit, async (c) => {
  const store = await cloudStore();
  const id = c.req.param('id');
  const upload = store && ID_PATTERN.test(id) ? await store.findUpload(id, c.get('userId')) : null;
  if (!store || !upload) return c.json({ error: 'Upload not found.' }, 404);
  if (upload.state === 'complete') {
    const saved = await store.get(upload.font_id);
    if (saved?.version === upload.id) return c.json({ font: toPublic(saved) });
    return c.json({ error: 'This upload has already been saved. Reload your library.' }, 409);
  }
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') return c.json({ error: 'Provide the font details.' }, 400);
  await store.claim(upload);
  try {
    const staged = await store.readStaged(upload);
    const valid = validateUpload(staged.bytes, { ...body, project: staged.project });
    if ('error' in valid) {
      await store.fail(upload);
      return c.json({ error: valid.error }, 400);
    }
    const row: FontRow = { id: upload.font_id, owner_id: upload.owner_id, owner_name: await displayName(upload.owner_id),
      name: valid.name, designer: valid.designer, visibility: valid.visibility, glyph_count: valid.glyphCount,
      size: valid.bytes.byteLength, created_at: Date.now(), updated_at: Date.now(), editable: 1 };
    const saved = await store.finish(upload, row, valid.bytes, JSON.stringify({ ...valid.project, libraryId: row.id }));
    return c.json({ font: toPublic(saved) }, upload.expected_version ? 200 : 201);
  } catch (error) { await store.fail(upload); throw error; }
});

app.get('/api/fonts/public', async (c) => {
  const page = Math.max(1, Math.min(1000000, Math.floor(Number(c.req.query('page')) || 1)));
  const pageSize = Math.max(1, Math.min(48, Math.floor(Number(c.req.query('pageSize')) || 24)));
  const query = cleanText(c.req.query('q'), 100);
  const result = await fonts.publicPage(query, pageSize, (page - 1) * pageSize);
  return c.json({ fonts: result.fonts.map(toPublic), total: result.total, page, pageSize });
});

app.get('/api/fonts/mine', requireUser, async (c) => c.json({ fonts: (await fonts.byOwner(c.get('userId'))).map(toPublic) }));

app.post('/api/fonts', requireUser, uploadLimit, async (c) => {
  const userId = c.get('userId');
  if (await fonts.countByOwner(userId) >= MAX_FONTS_PER_USER) {
    return c.json({ error: `You can keep up to ${MAX_FONTS_PER_USER} fonts. Delete one to save another.` }, 409);
  }
  const upload = await readUpload(c);
  if ('error' in upload) return c.json({ error: upload.error }, 400);
  const now = Date.now();
  const row: FontRow = {
    id: randomUUID(),
    owner_id: userId,
    owner_name: await displayName(userId),
    name: upload.name,
    designer: upload.designer,
    visibility: upload.visibility,
    glyph_count: upload.glyphCount,
    size: upload.bytes.byteLength,
    created_at: now,
    updated_at: now,
    editable: 1,
  };
  const project = { ...upload.project, libraryId: row.id };
  if (!await fonts.insert(row, upload.bytes, JSON.stringify(project), MAX_FONTS_PER_USER)) {
    return c.json({ error: `You can keep up to ${MAX_FONTS_PER_USER} fonts.` }, 409);
  }
  return c.json({ font: toPublic(row) }, 201);
});

app.put('/api/fonts/:id', requireUser, uploadLimit, async (c) => {
  const existing = await ownedFont(c);
  if (!existing) return c.json({ error: 'Font not found.' }, 404);
  const upload = await readUpload(c);
  if ('error' in upload) return c.json({ error: upload.error }, 400);
  const changes = {
    id: existing.id,
    owner_name: await displayName(existing.owner_id),
    name: upload.name,
    designer: upload.designer,
    visibility: upload.visibility,
    glyph_count: upload.glyphCount,
    size: upload.bytes.byteLength,
    updated_at: Date.now(),
  };
  const project = { ...upload.project, libraryId: existing.id };
  if (!await fonts.update(changes, existing.owner_id, upload.bytes, JSON.stringify(project))) {
    return c.json({ error: 'Font not found.' }, 404);
  }
  return c.json({ font: toPublic({ ...existing, ...changes, editable: 1 }) });
});

app.patch('/api/fonts/:id', requireUser, async (c) => {
  const existing = await ownedFont(c);
  if (!existing) return c.json({ error: 'Font not found.' }, 404);
  const body = await c.req.json().catch(() => null);
  const visibility = cleanVisibility(body?.visibility);
  if (!visibility) return c.json({ error: 'Choose private or public.' }, 400);
  if (visibility === 'public') {
    const content = await fonts.content(existing.id, existing);
    const bytes = content?.font_data;
    const inspected = bytes && inspectFont(bytes);
    if (!inspected || inspected.missing.length > 0) {
      return c.json({ error: `Draw all ${CHARSET.length} characters before publishing.` }, 400);
    }
  }
  if (!await fonts.setVisibility(existing.id, visibility, existing)) return c.json({ error: 'The font changed. Reload your library and try again.' }, 409);
  return c.json({ font: toPublic((await fonts.get(existing.id))!) });
});

app.delete('/api/fonts/:id', requireUser, async (c) => {
  const existing = await ownedFont(c);
  if (!existing) return c.json({ error: 'Font not found.' }, 404);
  await fonts.remove(existing.id);
  return c.json({ ok: true });
});

app.get('/api/fonts/:id/project', requireUser, async (c) => {
  const row = await ownedFont(c);
  if (!row) return c.json({ error: 'Font not found.' }, 404);
  const store = await cloudStore();
  if (store) return c.json({ projectUrl: await store.projectUrl(row.id) });
  const content = await fonts.content(row.id);
  if (!content?.project_json) return c.json({ error: 'This older font has no saved drawings.' }, 409);
  c.header('Cache-Control', 'private, no-store');
  return c.json({ project: JSON.parse(content.project_json) });
});

app.get('/api/fonts/:id/file', async (c) => {
  const id = c.req.param('id');
  const row = ID_PATTERN.test(id) ? await fonts.get(id) : undefined;
  if (!row) return c.json({ error: 'Font not found.' }, 404);
  if (row.visibility !== 'public') {
    const userId = await userIdFrom(c.req.header('authorization') ?? '');
    if (userId !== row.owner_id) return c.json({ error: 'Font not found.' }, 404);
  }
  const bytes = (await fonts.content(row.id, row))?.font_data;
  if (!bytes) return c.json({ error: 'Font not found.' }, 404);
  const download = c.req.query('download') === '1';
  if (download) {
    const inspected = inspectFont(bytes);
    if (!inspected || inspected.missing.length > 0) {
      return c.json({ error: `Finish all ${CHARSET.length} characters before downloading.` }, 400);
    }
  }
  const format = fontFormat(bytes);
  return c.body(new Uint8Array(bytes), 200, {
    'Content-Type': download ? 'application/octet-stream' : format.mime,
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${fontFileName(row.name, format.extension)}"`,
    'Cache-Control': row.visibility === 'public' ? 'public, max-age=300' : 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
});

app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));

app.route('/', website);
