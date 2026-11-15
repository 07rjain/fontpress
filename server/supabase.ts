import { PostgrestClient } from '@supabase/postgrest-js';
import { StorageClient } from '@supabase/storage-js';
import { randomUUID } from 'node:crypto';
import type { FontRow, Visibility } from './db.js';

export class StorageError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 429 | 503 = 503) { super(message); }
}
export type Upload = {
  id: string; font_id: string; owner_id: string; expected_version: string | null;
  state: 'pending' | 'processing' | 'complete' | 'failed'; created_at: string; expires_at: string;
  previous_font_path: string | null; previous_project_path: string | null;
};
type CloudRow = FontRow & { font_path: string; project_path: string; version: string };
const BUCKET = 'handpress';
const metadata = 'id,owner_id,owner_name,name,designer,visibility,glyph_count,size,created_at,updated_at,editable,version';
const stagePaths = (id: string) => [`staging/${id}/font`, `staging/${id}/project`];
const savedPaths = (id: string) => [`saved/${id}/font`, `saved/${id}/project`];
function check(error: { message: string } | null) {
  if (!error) return;
  if (error.message.includes('FONT_NOT_FOUND')) throw new StorageError('Font not found.', 404);
  if (error.message.includes('FONT_LIMIT')) throw new StorageError('You can keep up to 50 fonts. Delete one to save another.', 409);
  if (error.message.includes('UPLOAD_RATE_LIMIT')) throw new StorageError('Too many saves. Please try again in an hour.', 429);
  if (error.message.includes('UPLOAD_PENDING_LIMIT')) throw new StorageError('Please wait for your other saves to finish, or try again in 15 minutes.', 429);
  // Database and service responses may contain internal details. Never return them to browsers.
  throw new StorageError('The font service is unavailable. Check the Supabase setup and try again.');
}

export class SupabaseStore {
  readonly db;
  readonly storage;
  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new StorageError('The font service has not been configured.');
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const boundedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(20_000) });
    this.db = new PostgrestClient(`${url.replace(/\/$/, '')}/rest/v1`, { headers, fetch: boundedFetch });
    this.storage = new StorageClient(`${url.replace(/\/$/, '')}/storage/v1`, headers, boundedFetch);
  }
  get bucket() { return this.storage.from(BUCKET); }
  async health() {
    const [{ error }, { data: bucket, error: storageError }, { error: uploadsError }] = await Promise.all([
      this.db.rpc('handpress_public_page', { p_query: '', p_limit: 1, p_offset: 0 }),
      this.storage.getBucket(BUCKET), this.db.from('handpress_uploads').select('id').limit(1),
    ]);
    check(error); check(storageError); check(uploadsError);
    if (!bucket || bucket.public || bucket.file_size_limit !== 12 * 1024 * 1024) throw new StorageError('The private font storage bucket needs setup.');
  }
  async get(id: string): Promise<CloudRow | undefined> {
    const { data, error } = await this.db.from('handpress_fonts').select('*').eq('id', id).maybeSingle(); check(error);
    return data ?? undefined;
  }
  async content(id: string, snapshot?: FontRow) {
    const row = (snapshot as CloudRow | undefined) ?? await this.get(id);
    if (!row) return undefined;
    const font = await this.readObject(row.font_path, 4 * 1024 * 1024);
    return { font_data: Buffer.from(font), project_json: null };
  }
  async projectUrl(id: string) {
    const row = await this.get(id);
    if (!row) throw new StorageError('Font not found.', 404);
    const { data, error } = await this.bucket.createSignedUrl(row.project_path, 60); check(error);
    return data!.signedUrl;
  }
  async readObject(path: string, max: number): Promise<Uint8Array> {
    const { data, error } = await this.bucket.download(path); check(error);
    if (!data || data.size > max) throw new StorageError('The uploaded file is missing or too large.', 400);
    return new Uint8Array(await data.arrayBuffer());
  }
  async byOwner(owner: string): Promise<FontRow[]> {
    const { data, error } = await this.db.from('handpress_fonts').select(metadata).eq('owner_id', owner).order('updated_at', { ascending: false }).order('id'); check(error);
    return data ?? [];
  }
  async countByOwner(owner: string) {
    const { count, error } = await this.db.from('handpress_fonts').select('id', { count: 'exact', head: true }).eq('owner_id', owner); check(error); return count ?? 0;
  }
  async publicPage(query: string, limit: number, offset: number): Promise<{ fonts: FontRow[]; total: number }> {
    const { data, error } = await this.db.rpc('handpress_public_page', { p_query: query, p_limit: limit, p_offset: offset }); check(error); return data;
  }
  async reserve(owner: string, fontId: string | null) {
    await this.cleanup().catch(() => {});
    const { data, error } = await this.db.rpc('handpress_reserve_upload', { p_owner: owner, p_font_id: fontId, p_upload_id: randomUUID() }); check(error);
    const upload = Array.isArray(data) ? data[0] : data;
    if (!upload?.id) throw new StorageError('The upload could not be prepared.');
    return upload as Upload;
  }
  async signedUploads(upload: Upload) {
    const results = await Promise.all(stagePaths(upload.id).map((path) => this.bucket.createSignedUploadUrl(path, { upsert: false })));
    for (const result of results) check(result.error);
    return { font: results[0].data!.signedUrl, project: results[1].data!.signedUrl };
  }
  async findUpload(id: string, owner: string): Promise<Upload | undefined> {
    const { data, error } = await this.db.from('handpress_uploads').select('*').eq('id', id).eq('owner_id', owner).maybeSingle(); check(error); return data ?? undefined;
  }
  async claim(upload: Upload) {
    const { data, error } = await this.db.from('handpress_uploads').update({ state: 'processing' }).eq('id', upload.id)
      .eq('owner_id', upload.owner_id).eq('state', 'pending').gt('created_at', new Date(Date.now() - 15 * 60_000).toISOString()).select('id'); check(error);
    if (!data?.length) throw new StorageError('This upload has expired or is already being saved. Please save again.', 409);
  }
  async readStaged(upload: Upload) {
    const [font, project] = await Promise.all([this.readObject(stagePaths(upload.id)[0], 4 * 1024 * 1024), this.readObject(stagePaths(upload.id)[1], 12 * 1024 * 1024)]);
    return { bytes: font, project: Buffer.from(project).toString('utf8') };
  }
  async fail(upload: Upload) {
    // Never remove canonical objects here: a commit may have succeeded before a network timeout.
    await this.db.from('handpress_uploads').update({ state: 'failed' }).eq('id', upload.id).eq('state', 'processing');
  }
  async finish(upload: Upload, row: FontRow, bytes: Uint8Array, project: string) {
    const results = await Promise.all([
      this.bucket.upload(savedPaths(upload.id)[0], bytes, { contentType: 'application/octet-stream', upsert: false }),
      this.bucket.upload(savedPaths(upload.id)[1], project, { contentType: 'application/json', upsert: false }),
    ]);
    for (const result of results) check(result.error);
    const { data, error } = await this.db.rpc('handpress_commit_upload', { p_upload_id: upload.id, p_owner: upload.owner_id, p_metadata: row }); check(error);
    if (!data) throw new StorageError('The saved font changed or your library is full. Reload your library and try again.', 409);
    // Cleanup is retried after signed upload tokens expire; the validated objects cannot be changed with those tokens.
    return (await this.get(upload.font_id))!;
  }
  async insert(row: FontRow, bytes: Uint8Array, project: string, _limit: number) {
    const upload = await this.reserve(row.owner_id, null);
    // The caller's generated ID must match the reserve result for local-style uploads.
    row.id = upload.font_id;
    const source = JSON.parse(project); source.libraryId = row.id;
    await this.claim(upload);
    try { await this.finish(upload, row, bytes, JSON.stringify(source)); return true; }
    catch (error) { await this.fail(upload); throw error; }
  }
  async update(row: Pick<FontRow, 'id' | 'owner_name' | 'name' | 'designer' | 'visibility' | 'glyph_count' | 'size' | 'updated_at'>, owner: string, bytes: Uint8Array, project: string) {
    const upload = await this.reserve(owner, row.id);
    const existing = await this.get(row.id);
    if (!existing || existing.version !== upload.expected_version) return false;
    await this.claim(upload);
    try { await this.finish(upload, { ...existing, ...row }, bytes, project); return true; }
    catch (error) { await this.fail(upload); throw error; }
  }
  async setVisibility(id: string, visibility: Visibility, version?: string) {
    const { data, error } = await this.db.from('handpress_fonts').update({ visibility, updated_at: Date.now() }).eq('id', id).eq('version', version!).select('id'); check(error);
    return Boolean(data?.length);
  }
  async remove(id: string) {
    const { data, error } = await this.db.from('handpress_fonts').delete().eq('id', id).select('font_path,project_path'); check(error);
    if (data?.[0]) await this.bucket.remove([data[0].font_path, data[0].project_path]);
  }
  async cleanup() {
    const { data, error } = await this.db.from('handpress_uploads').select('*').eq('cleaned', false).lt('expires_at', new Date().toISOString()).limit(5); check(error);
    for (const upload of (data ?? []) as Upload[]) {
      const current = await this.get(upload.font_id);
      const paths = [...stagePaths(upload.id), ...savedPaths(upload.id), upload.previous_font_path, upload.previous_project_path]
        .filter((path): path is string => Boolean(path) && path !== current?.font_path && path !== current?.project_path);
      const { error: removeError } = await this.bucket.remove(paths); check(removeError);
      const { error: updateError } = await this.db.from('handpress_uploads').update({ cleaned: true }).eq('id', upload.id); check(updateError);
    }
    // Retain upload records for rate limits and retry signaling, then remove the cleaned history.
    const { error: pruneError } = await this.db.from('handpress_uploads').delete().eq('cleaned', true).lt('created_at', new Date(Date.now() - 24 * 60 * 60_000).toISOString()); check(pruneError);
  }
}
