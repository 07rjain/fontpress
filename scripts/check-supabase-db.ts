import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';

// Requires PostgreSQL command-line tools. Always creates a disposable cluster; never uses a live database.
const exec = promisify(execFile);
const dir = await mkdtemp(join(tmpdir(), 'handpress-pg-'));
const data = join(dir, 'data');
const psql = async (...args: string[]) => (await exec('psql', ['-h', dir, '-U', 'postgres', '-p', '18789', '-v', 'ON_ERROR_STOP=1', '-At', ...args])).stdout.trim();
let started = false;
try {
  await exec('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8']);
  await exec('pg_ctl', ['-D', data, '-l', join(dir, 'server.log'), '-o', `-k ${dir} -p 18789 -h ''`, 'start']);
  started = true;
  await psql('-c', `create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`);
  await psql('-f', 'supabase/migrations/202611150001_handpress.sql');
  // The migration must be safe to rerun without deleting saved records.
  await psql('-f', 'supabase/migrations/202611150001_handpress.sql');
  await psql('-f', 'tests/supabase-db.sql');
  // Real independent sessions race to save entries 50 and 51. Exactly one may commit.
  const ids = ['aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'];
  for (const id of ids) await psql('-c', `select * from public.handpress_reserve_upload('quota', null, '${id}');`);
  await psql('-c', `update public.handpress_uploads set state = 'processing' where owner_id = 'quota';`);
  const results = await Promise.all(ids.map((id) => psql('-c', `set role service_role; select public.handpress_commit_upload('${id}', 'quota',
    '{"owner_name":"Quota","name":"Race","designer":"","visibility":"private","glyph_count":1,"size":100,"updated_at":1}'::jsonb);`)));
  assert.deepEqual(results.map((result) => result.split('\n').at(-1)).sort(), ['f', 't']);
  assert.equal(await psql('-c', `select count(*) from public.handpress_fonts where owner_id = 'quota';`), '50');
  console.log('Supabase SQL checks passed: migration, permissions, ownership, expiry, stale updates, literal search, upload limits and concurrent quota.');
} finally {
  if (started) await exec('pg_ctl', ['-D', data, '-m', 'fast', 'stop']);
  await rm(dir, { recursive: true, force: true });
}
