import { userIdFrom, displayName } from './auth';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fonts, readFontFile, removeFontFile, type FontRow, type Visibility } from './db';
import { inspectFont } from './inspect';
import { CHARSET } from '../src/spec';
import { readProjectUpload } from './project';
import { fontFormat } from '../src/fontFormat';

const MAX_FONT_BYTES = 4 * 1024 * 1024;
const MAX_FONTS_PER_USER = 50;
const ID_PATTERN = /^[0-9a-f-]{36}$/;

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

function fileName(name: string, extension: string) {
  const base = name.replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-') || 'handpress-font';
  return `${base}.${extension}`;
}

async function readUpload(c: Context<Env>) {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return { error: 'Attach the font file.' } as const;
  const bytes = new Uint8Array(await file.arrayBuffer());
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

function ownedFont(c: Context<Env>): FontRow | null {
  const id = c.req.param('id') ?? '';
  if (!ID_PATTERN.test(id)) return null;
  const row = fonts.get(id);
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
  maxSize: 20 * 1024 * 1024,
  onError: (c) => c.json({ error: 'The font and drawings are too large.' }, 413),
});

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/fonts/public', (c) => {
  const page = Math.max(1, Math.min(1000000, Math.floor(Number(c.req.query('page')) || 1)));
  const pageSize = Math.max(1, Math.min(48, Math.floor(Number(c.req.query('pageSize')) || 24)));
  const query = cleanText(c.req.query('q'), 100);
  const result = fonts.publicPage(query, pageSize, (page - 1) * pageSize);
  return c.json({ fonts: result.fonts.map(toPublic), total: result.total, page, pageSize });
});

app.get('/api/fonts/mine', requireUser, (c) => c.json({ fonts: fonts.byOwner(c.get('userId')).map(toPublic) }));

app.post('/api/fonts', requireUser, uploadLimit, async (c) => {
  const userId = c.get('userId');
  if (fonts.countByOwner(userId) >= MAX_FONTS_PER_USER) {
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
  if (!fonts.insert(row, upload.bytes, JSON.stringify(project), MAX_FONTS_PER_USER)) {
    return c.json({ error: `You can keep up to ${MAX_FONTS_PER_USER} fonts.` }, 409);
  }
  return c.json({ font: toPublic(row) }, 201);
});

app.put('/api/fonts/:id', requireUser, uploadLimit, async (c) => {
  const existing = ownedFont(c);
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
  if (!fonts.update(changes, existing.owner_id, upload.bytes, JSON.stringify(project))) {
    return c.json({ error: 'Font not found.' }, 404);
  }
  return c.json({ font: toPublic({ ...existing, ...changes, editable: 1 }) });
});

app.patch('/api/fonts/:id', requireUser, async (c) => {
  const existing = ownedFont(c);
  if (!existing) return c.json({ error: 'Font not found.' }, 404);
  const body = await c.req.json().catch(() => null);
  const visibility = cleanVisibility(body?.visibility);
  if (!visibility) return c.json({ error: 'Choose private or public.' }, 400);
  if (visibility === 'public') {
    const content = fonts.content(existing.id);
    const bytes = content?.font_data ?? await readFontFile(existing.id).catch(() => null);
    const inspected = bytes && inspectFont(bytes);
    if (!inspected || inspected.missing.length > 0) {
      return c.json({ error: `Draw all ${CHARSET.length} characters before publishing.` }, 400);
    }
  }
  if (!ownedFont(c)) return c.json({ error: 'Font not found.' }, 404);
  fonts.setVisibility(existing.id, visibility);
  return c.json({ font: toPublic(fonts.get(existing.id)!) });
});

app.delete('/api/fonts/:id', requireUser, async (c) => {
  const existing = ownedFont(c);
  if (!existing) return c.json({ error: 'Font not found.' }, 404);
  fonts.remove(existing.id);
  await removeFontFile(existing.id);
  return c.json({ ok: true });
});

app.get('/api/fonts/:id/project', requireUser, (c) => {
  const row = ownedFont(c);
  if (!row) return c.json({ error: 'Font not found.' }, 404);
  const content = fonts.content(row.id);
  if (!content?.project_json) return c.json({ error: 'This older font has no saved drawings.' }, 409);
  c.header('Cache-Control', 'private, no-store');
  return c.json({ project: JSON.parse(content.project_json) });
});

app.get('/api/fonts/:id/file', async (c) => {
  const id = c.req.param('id');
  const row = ID_PATTERN.test(id) ? fonts.get(id) : undefined;
  if (!row) return c.json({ error: 'Font not found.' }, 404);
  if (row.visibility !== 'public') {
    const userId = await userIdFrom(c.req.header('authorization') ?? '');
    if (userId !== row.owner_id) return c.json({ error: 'Font not found.' }, 404);
  }
  const bytes = fonts.content(row.id)?.font_data ?? await readFontFile(row.id).catch(() => null);
  if (!bytes) return c.json({ error: 'Font not found.' }, 404);
  const format = fontFormat(bytes);
  return c.body(new Uint8Array(bytes), 200, {
    'Content-Type': format.mime,
    'Content-Disposition': `attachment; filename="${fileName(row.name, format.extension)}"`,
    'Cache-Control': row.visibility === 'public' ? 'public, max-age=300' : 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
});

app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));

if (existsSync('dist/index.html')) {
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', serveStatic({ path: './dist/index.html' }));
}
