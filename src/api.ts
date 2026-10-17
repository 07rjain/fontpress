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
    const fallback = response.status >= 500 ? 'The Handpress server is not responding.' : 'Something went wrong.';
    throw new ApiError(body?.error ?? fallback, response.status);
  }
  return response;
}

export async function listPublicFonts(): Promise<SavedFont[]> {
  const response = await call('/api/fonts/public', {});
  return (await response.json()).fonts;
}

export async function listMyFonts(getToken: TokenSource): Promise<SavedFont[]> {
  const response = await call('/api/fonts/mine', {}, getToken);
  return (await response.json()).fonts;
}

export async function saveFont(
  getToken: TokenSource,
  input: { id: string | null; buffer: ArrayBuffer; name: string; designer: string; visibility: Visibility },
): Promise<SavedFont> {
  const form = new FormData();
  form.set('file', new Blob([input.buffer], { type: 'font/ttf' }), 'font.ttf');
  form.set('name', input.name);
  form.set('designer', input.designer);
  form.set('visibility', input.visibility);
  const path = input.id ? `/api/fonts/${input.id}` : '/api/fonts';
  const response = await call(path, { method: input.id ? 'PUT' : 'POST', body: form }, getToken);
  return (await response.json()).font;
}

export async function setFontVisibility(getToken: TokenSource, id: string, visibility: Visibility): Promise<SavedFont> {
  const response = await call(
    `/api/fonts/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visibility }) },
    getToken,
  );
  return (await response.json()).font;
}

export async function deleteFont(getToken: TokenSource, id: string): Promise<void> {
  await call(`/api/fonts/${id}`, { method: 'DELETE' }, getToken);
}

export async function fetchFontFile(font: SavedFont, getToken?: TokenSource): Promise<ArrayBuffer> {
  const response = await call(`/api/fonts/${font.id}/file?v=${font.updatedAt}`, {}, getToken);
  return response.arrayBuffer();
}
