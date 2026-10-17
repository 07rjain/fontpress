import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type Visibility = 'private' | 'public';

export type FontRow = {
  id: string;
  owner_id: string;
  owner_name: string;
  name: string;
  designer: string;
  visibility: Visibility;
  glyph_count: number;
  size: number;
  created_at: number;
  updated_at: number;
};

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? 'data');
const FONT_DIR = path.join(DATA_DIR, 'fonts');
mkdirSync(FONT_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'handpress.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  create table if not exists fonts (
    id text primary key,
    owner_id text not null,
    owner_name text not null,
    name text not null,
    designer text not null,
    visibility text not null check (visibility in ('private', 'public')),
    glyph_count integer not null,
    size integer not null,
    created_at integer not null,
    updated_at integer not null
  );
  create index if not exists fonts_by_owner on fonts (owner_id, updated_at desc);
  create index if not exists fonts_by_visibility on fonts (visibility, updated_at desc);
`);

const statements = {
  get: db.prepare<[string], FontRow>('select * from fonts where id = ?'),
  byOwner: db.prepare<[string], FontRow>('select * from fonts where owner_id = ? order by updated_at desc'),
  countByOwner: db.prepare<[string], { n: number }>('select count(*) as n from fonts where owner_id = ?'),
  publicList: db.prepare<[number], FontRow>(
    "select * from fonts where visibility = 'public' order by updated_at desc limit ?",
  ),
  insert: db.prepare<FontRow>(`
    insert into fonts (id, owner_id, owner_name, name, designer, visibility, glyph_count, size, created_at, updated_at)
    values (@id, @owner_id, @owner_name, @name, @designer, @visibility, @glyph_count, @size, @created_at, @updated_at)
  `),
  update: db.prepare<Pick<FontRow, 'id' | 'owner_name' | 'name' | 'designer' | 'visibility' | 'glyph_count' | 'size' | 'updated_at'>>(`
    update fonts set owner_name = @owner_name, name = @name, designer = @designer, visibility = @visibility,
      glyph_count = @glyph_count, size = @size, updated_at = @updated_at
    where id = @id
  `),
  setVisibility: db.prepare<[Visibility, number, string]>('update fonts set visibility = ?, updated_at = ? where id = ?'),
  remove: db.prepare<[string]>('delete from fonts where id = ?'),
};

export const fonts = {
  get: (id: string) => statements.get.get(id),
  byOwner: (ownerId: string) => statements.byOwner.all(ownerId),
  countByOwner: (ownerId: string) => statements.countByOwner.get(ownerId)?.n ?? 0,
  publicList: (limit: number) => statements.publicList.all(limit),
  insert: (row: FontRow) => statements.insert.run(row),
  update: (row: Parameters<typeof statements.update.run>[0]) => statements.update.run(row),
  setVisibility: (id: string, visibility: Visibility) => statements.setVisibility.run(visibility, Date.now(), id),
  remove: (id: string) => statements.remove.run(id),
};

function fontPath(id: string) {
  return path.join(FONT_DIR, `${id}.ttf`);
}

export async function writeFontFile(id: string, bytes: Uint8Array) {
  const target = fontPath(id);
  const temp = `${target}.${randomUUID()}.tmp`;
  await writeFile(temp, bytes);
  await rename(temp, target);
}

export function readFontFile(id: string) {
  return readFile(fontPath(id));
}

export function removeFontFile(id: string) {
  return rm(fontPath(id), { force: true });
}
