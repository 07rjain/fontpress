import './env';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fonts, readFontFile, removeFontFile, writeFontFile, type FontRow, type Visibility } from './db';
import { inspectFont } from './inspect';
import { CHARSET } from '../src/spec';

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) throw new Error('CLERK_SECRET_KEY is missing. Add it to .env.');

const clerk = createClerkClient({ secretKey });
const authorizedParties = (process.env.APP_ORIGINS ?? 'http://localhost:5173,http://localhost:8787')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const MAX_FONT_BYTES = 4 * 1024 * 1024;
const MAX_FONTS_PER_USER = 50;
const ID_PATTERN = /^[0-9a-f-]{36}$/;

type Env = { Variables: { userId: string } };
const app = new Hono<Env>();

async function userIdFrom(header: string): Promise<string | null> {
  if (!header.startsWith('Bearer ')) return null;
  try {
    const { sub } = await verifyToken(header.slice(7), { secretKey, authorizedParties });
    return sub || null;
  } catch (error) {
    console.warn(`Rejected session token: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function displayName(userId: string): Promise<string> {
  try {
    const user = await clerk.users.getUser(userId);
    return user.fullName || user.username || user.firstName || 'Anonymous';
  } catch {
    return 'Anonymous';
  }
}

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
  };
}

function fileName(name: string) {
  const base = name.replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-') || 'handpress-font';
  return `${base}.ttf`;
}

async function readUpload(c: Context<Env>) {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return { error: 'Attach the font file.' } as const;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const inspected = inspectFont(bytes);
  if (!inspected) return { error: 'That file is not a font Handpress can store.' } as const;
  if (inspected.glyphCount < CHARSET.length) {
    return { error: `Draw all ${CHARSET.length} characters before saving this font.` } as const;
  }
  const visibility = cleanVisibility(body.visibility);
  if (!visibility) return { error: 'Choose private or public.' } as const;
  return {
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
  c.set('userId', userId);
  await next();
};

const uploadLimit = bodyLimit({
  maxSize: MAX_FONT_BYTES,
  onError: (c) => c.json({ error: 'The font file is too large.' }, 413),
});

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/fonts/public', (c) => c.json({ fonts: fonts.publicList(120).map(toPublic) }));

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
  };
  await writeFontFile(row.id, upload.bytes);
  fonts.insert(row);
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
  await writeFontFile(existing.id, upload.bytes);
  fonts.update(changes);
  return c.json({ font: toPublic({ ...existing, ...changes }) });
});

app.patch('/api/fonts/:id', requireUser, async (c) => {
  const existing = ownedFont(c);
  if (!existing) return c.json({ error: 'Font not found.' }, 404);
  const body = await c.req.json().catch(() => null);
  const visibility = cleanVisibility(body?.visibility);
  if (!visibility) return c.json({ error: 'Choose private or public.' }, 400);
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

app.get('/api/fonts/:id/file', async (c) => {
  const id = c.req.param('id');
  const row = ID_PATTERN.test(id) ? fonts.get(id) : undefined;
  if (!row) return c.json({ error: 'Font not found.' }, 404);
  if (row.visibility !== 'public') {
    const userId = await userIdFrom(c.req.header('authorization') ?? '');
    if (userId !== row.owner_id) return c.json({ error: 'Font not found.' }, 404);
  }
  const bytes = await readFontFile(row.id).catch(() => null);
  if (!bytes) return c.json({ error: 'Font not found.' }, 404);
  return c.body(new Uint8Array(bytes), 200, {
    'Content-Type': 'font/ttf',
    'Content-Disposition': `attachment; filename="${fileName(row.name)}"`,
    'Cache-Control': row.visibility === 'public' ? 'public, max-age=300' : 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
});

app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));

if (existsSync('dist/index.html')) {
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Handpress API listening on http://localhost:${port}`);
});
