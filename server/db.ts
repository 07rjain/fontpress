import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
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
  editable: number;
  version?: string;
};

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? 'data');
const FONT_DIR = path.join(DATA_DIR, 'fonts');
mkdirSync(FONT_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'handpress.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  create table if not exists fonts (
    id text primary key, owner_id text not null, owner_name text not null,
    name text not null, designer text not null,
    visibility text not null check (visibility in ('private', 'public')),
    glyph_count integer not null, size integer not null,
    created_at integer not null, updated_at integer not null
  );
  create index if not exists fonts_by_owner on fonts (owner_id, updated_at desc);
  create index if not exists fonts_by_visibility on fonts (visibility, updated_at desc);
`);
// Existing files remain readable; new writes keep the font and source in one transaction.
const columns = db.pragma('table_info(fonts)') as { name: string }[];
for (const [name, type] of [['font_data', 'blob'], ['project_json', 'text']]) {
  if (!columns.some((column) => column.name === name)) db.exec(`alter table fonts add column ${name} ${type}`);
}
const metadata = `id, owner_id, owner_name, name, designer, visibility, glyph_count, size,
  created_at, updated_at, (project_json is not null) as editable`;
const publicFilter = `visibility = 'public' and instr(lower(name || ' ' || designer || ' ' || owner_name), lower(@query)) > 0`;
const statements = {
  get: db.prepare<[string], FontRow>(`select ${metadata} from fonts where id = ?`),
  content: db.prepare<[string], { font_data: Buffer | null; project_json: string | null }>(
    'select font_data, project_json from fonts where id = ?'),
  byOwner: db.prepare<[string], FontRow>(`select ${metadata} from fonts where owner_id = ? order by updated_at desc, id`),
  countByOwner: db.prepare<[string], { n: number }>('select count(*) as n from fonts where owner_id = ?'),
  publicList: db.prepare<{ query: string; limit: number; offset: number }, FontRow>(
    `select ${metadata} from fonts where ${publicFilter} order by updated_at desc, id limit @limit offset @offset`),
  publicCount: db.prepare<{ query: string }, { n: number }>(`select count(*) as n from fonts where ${publicFilter}`),
  insert: db.prepare(`insert into fonts
    (id, owner_id, owner_name, name, designer, visibility, glyph_count, size, created_at, updated_at, font_data, project_json)
    values (@id, @owner_id, @owner_name, @name, @designer, @visibility, @glyph_count, @size, @created_at, @updated_at, @font_data, @project_json)`),
  update: db.prepare(`update fonts set owner_name = @owner_name, name = @name, designer = @designer,
    visibility = @visibility, glyph_count = @glyph_count, size = @size, updated_at = @updated_at,
    font_data = @font_data, project_json = @project_json where id = @id and owner_id = @owner_id`),
  setVisibility: db.prepare<[Visibility, number, string]>('update fonts set visibility = ?, updated_at = ? where id = ?'),
  remove: db.prepare<[string]>('delete from fonts where id = ?'),
};

const insert = db.transaction((row: FontRow, bytes: Uint8Array, project: string, limit: number) => {
  if ((statements.countByOwner.get(row.owner_id)?.n ?? 0) >= limit) return false;
  statements.insert.run({ ...row, font_data: Buffer.from(bytes), project_json: project });
  return true;
});
export const fonts = {
  get: (id: string) => statements.get.get(id),
  content: (id: string) => statements.content.get(id),
  byOwner: (id: string) => statements.byOwner.all(id),
  countByOwner: (id: string) => statements.countByOwner.get(id)?.n ?? 0,
  publicPage: (query: string, limit: number, offset: number) => ({
    fonts: statements.publicList.all({ query, limit, offset }), total: statements.publicCount.get({ query })?.n ?? 0,
  }),
  insert,
  update: (row: Pick<FontRow, 'id' | 'owner_name' | 'name' | 'designer' | 'visibility' | 'glyph_count' | 'size' | 'updated_at'>,
    ownerId: string, bytes: Uint8Array, project: string) => statements.update.run({
      ...row, owner_id: ownerId, font_data: Buffer.from(bytes), project_json: project,
    }).changes > 0,
  setVisibility: (id: string, visibility: Visibility) => statements.setVisibility.run(visibility, Date.now(), id),
  remove: (id: string) => statements.remove.run(id),
};

export function readFontFile(id: string) { return readFile(path.join(FONT_DIR, `${id}.ttf`)); }
export function removeFontFile(id: string) { return rm(path.join(FONT_DIR, `${id}.ttf`), { force: true }); }
