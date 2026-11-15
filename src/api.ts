export type Visibility = 'private' | 'public';

export type SavedFont = {
  id: string;
  name: string;
  designer: string;
  ownerName: string;
  visibility: Visibility;
  glyphCount: number;
  size: number;
  createdAt: number;
  updatedAt: number;
  editable: boolean;
};

export type TokenSource = () => Promise<string | null>;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call(path: string, init: RequestInit, getToken?: TokenSource): Promise<Response> {
  const headers = new Headers(init.headers);
  if (getToken) {
    const token = await getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError('Could not reach the Handpress server.', 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const fallback = response.status === 401 ? 'Sign in to continue.'
      : response.status === 404 || response.status >= 500 ? 'The font service is temporarily unavailable. Please try again later.'
        : 'That request could not be completed. Please try again.';
    throw new ApiError(typeof body?.error === 'string' ? body.error : fallback, response.status);
  }
  return response;
}

async function json<T>(response: Response): Promise<T> {
  // A static-site rewrite can return index.html with HTTP 200 for a missing API.
  // Treat that as a deployment failure instead of a JSON parser error or empty gallery.
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError('The font service is temporarily unavailable. Please try again later.', 502);
  }
  try { return await response.json() as T; }
  catch { throw new ApiError('The font service returned an unreadable response. Please try again later.', 502); }
}

export async function listPublicFonts(): Promise<SavedFont[]> {
  const response = await call('/api/fonts/public', {});
  return (await json<{ fonts: SavedFont[] }>(response)).fonts;
}

export type FontPage = { fonts: SavedFont[]; total: number; page: number; pageSize: number };
export async function searchPublicFonts(query: string, page: number): Promise<FontPage> {
  const params = new URLSearchParams({ q: query, page: String(page) });
  const response = await call(`/api/fonts/public?${params}`, {});
  return json<FontPage>(response);
}

export async function fetchFontProject(getToken: TokenSource, id: string): Promise<Project> {
  const response = await call(`/api/fonts/${id}/project`, {}, getToken);
  const body = await json<{ project?: Project; projectUrl?: string }>(response);
  if (body.project) return body.project;
  if (!body.projectUrl) throw new ApiError('The saved drawings could not be opened.', 502);
  // This short-lived URL is issued only after the API checks ownership. Do not send Clerk tokens to Storage.
  const project = await call(body.projectUrl, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  return json<Project>(project);
}

export async function listMyFonts(getToken: TokenSource): Promise<SavedFont[]> {
  const response = await call('/api/fonts/mine', {}, getToken);
  return (await json<{ fonts: SavedFont[] }>(response)).fonts;
}

export async function saveFont(
  getToken: TokenSource,
  input: { id: string | null; buffer: ArrayBuffer; name: string; designer: string; visibility: Visibility; project: Project },
): Promise<SavedFont> {
  const project = JSON.stringify(input.project);
  if (input.buffer.byteLength > 4 * 1024 * 1024 || new Blob([project]).size > 12 * 1024 * 1024) {
    throw new ApiError('The font or drawings are too large to save.', 413);
  }
  const preparation = await call('/api/uploads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fontId: input.id }),
  }, getToken);
  const upload = await json<{ mode: 'multipart' | 'direct'; uploadId?: string; urls?: { font: string; project: string } }>(preparation);
  if (upload.mode === 'direct' && upload.urls && upload.uploadId) {
    // The compiled font and project bypass Vercel's 4.5 MB request limit.
    await Promise.all([
      call(upload.urls.font, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'x-upsert': 'false' }, body: input.buffer, credentials: 'omit', referrerPolicy: 'no-referrer' }),
      call(upload.urls.project, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-upsert': 'false' }, body: project, credentials: 'omit', referrerPolicy: 'no-referrer' }),
    ]);
    const response = await call(`/api/uploads/${upload.uploadId}/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.name, designer: input.designer, visibility: input.visibility }),
    }, getToken);
    return (await json<{ font: SavedFont }>(response)).font;
  }
  if (upload.mode !== 'multipart') throw new ApiError('The font service returned an invalid upload response.', 502);
  const form = new FormData();
  const format = fontFormat(input.buffer);
  form.set('file', new Blob([input.buffer], { type: format.mime }), `font.${format.extension}`);
  form.set('project', project);
  form.set('name', input.name);
  form.set('designer', input.designer);
  form.set('visibility', input.visibility);
  const path = input.id ? `/api/fonts/${input.id}` : '/api/fonts';
  const response = await call(path, { method: input.id ? 'PUT' : 'POST', body: form }, getToken);
  return (await json<{ font: SavedFont }>(response)).font;
}

export async function setFontVisibility(getToken: TokenSource, id: string, visibility: Visibility): Promise<SavedFont> {
  const response = await call(
    `/api/fonts/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visibility }) },
    getToken,
  );
  return (await json<{ font: SavedFont }>(response)).font;
}

export async function deleteFont(getToken: TokenSource, id: string): Promise<void> {
  await call(`/api/fonts/${id}`, { method: 'DELETE' }, getToken);
}

export async function fetchFontFile(font: SavedFont, getToken?: TokenSource, download = false): Promise<ArrayBuffer> {
  const response = await call(`/api/fonts/${font.id}/file?v=${font.updatedAt}${download ? '&download=1' : ''}`, {}, getToken);
  return response.arrayBuffer();
}
import { fontFormat } from './fontFormat';
import type { Project } from './types';
