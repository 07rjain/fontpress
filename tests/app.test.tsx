// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { SavedFont } from '../src/api';
import { App } from '../src/App';
import * as api from '../src/api';
import { assembleFont } from '../src/font';
import { saveProject, listDrafts, loadDraft, loadProject } from '../src/storage';
import { projectFixture, fontFixture } from './fixtures';
import { installCanvas } from './canvas';

const session = vi.hoisted(() => ({ userId: 'alice', token: async () => session.userId }));
vi.mock('@clerk/react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: session.userId, getToken: session.token }),
  useClerk: () => ({}), UserButton: () => null,
}));
vi.mock('../src/api', async (original) => ({ ...await original<typeof import('../src/api')>(),
  listMyFonts: vi.fn(), fetchFontFile: vi.fn(), fetchFontProject: vi.fn(), saveFont: vi.fn(),
  listPublicFonts: vi.fn(), setFontVisibility: vi.fn(), deleteFont: vi.fn(),
}));
vi.mock('../src/font', async (original) => ({ ...await original<typeof import('../src/font')>(),
  assembleFont: vi.fn(), publishPreview: vi.fn(async () => {}),
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function saved(id: string, name: string): SavedFont {
  return { id, name, designer: '', ownerName: 'Owner', visibility: 'private', glyphCount: 1,
    size: 100, createdAt: 1, updatedAt: 1, editable: true };
}

beforeEach(async () => {
  vi.clearAllMocks();
  installCanvas();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('FontFace', class { async load() { return this; } });
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add() {}, delete() {} } });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  session.userId = 'alice';
  window.location.hash = '/library';
  vi.mocked(api.listMyFonts).mockResolvedValue([]);
  vi.mocked(api.listPublicFonts).mockResolvedValue([]);
  vi.mocked(api.fetchFontFile).mockResolvedValue(new ArrayBuffer(4));
  vi.mocked(assembleFont).mockResolvedValue({ buffer: new ArrayBuffer(4), covered: ['A'] });
  await saveProject(projectFixture(['A'], 'AliceDraft'), 'alice');
  await saveProject(projectFixture(['A'], 'BobDraft'), 'bob');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('a delayed private library response cannot populate the next account', async () => {
  const pending = deferred<SavedFont[]>();
  vi.mocked(api.listMyFonts).mockImplementation(async (getToken) => (await getToken()) === 'alice'
    ? pending.promise : [saved('bob-font', 'Bob private font')]);
  const view = render(<App />);
  await waitFor(() => expect(api.listMyFonts).toHaveBeenCalledTimes(1));
  session.userId = 'bob'; view.rerender(<App />);
  await screen.findByRole('heading', { name: 'Bob private font' });
  await act(async () => { pending.resolve([saved('alice-font', 'Alice secret font')]); });
  expect(screen.queryAllByText('Alice secret font')).toHaveLength(0);
  expect(screen.getByRole('heading', { name: 'Bob private font' })).toBeTruthy();
});

test('changing account while tracing cancels the upload and leaves the next account usable', async () => {
  window.location.hash = '/specimen';
  const pending = deferred<Awaited<ReturnType<typeof assembleFont>>>();
  vi.mocked(assembleFont).mockImplementation(async (_glyphs, name) => name === 'AliceDraft'
    ? pending.promise : { buffer: new ArrayBuffer(4), covered: ['A'] });
  const view = render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Save privately' }));
  await waitFor(() => expect(assembleFont).toHaveBeenCalled());
  session.userId = 'bob'; view.rerender(<App />);
  await screen.findByDisplayValue('BobDraft');
  await act(async () => { pending.resolve({ buffer: new ArrayBuffer(4), covered: ['A'] }); });
  expect(api.saveFont).not.toHaveBeenCalled();
  expect((screen.getByRole('button', { name: 'Save privately' }) as HTMLButtonElement).disabled).toBe(false);
});

test('starting a new draft during an upload preserves the old draft and ignores the old save result', async () => {
  window.location.hash = '/specimen';
  const pending = deferred<SavedFont>();
  vi.mocked(api.saveFont).mockReturnValue(pending.promise);
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Save privately' }));
  await waitFor(() => expect(api.saveFont).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Start a new font' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start new font' }));
  await screen.findByText('Started a new font. Your previous draft is kept in My fonts on this browser.');
  await act(async () => { pending.resolve(saved('old-save', 'AliceDraft')); });
  const active = await loadProject('alice');
  expect(active!.familyName).toBe('My Hand');
  expect(active!.libraryId).toBeNull();
  const previous = (await listDrafts('alice')).find((draft) => draft.name === 'AliceDraft');
  expect(previous).toBeTruthy();
  expect((await loadDraft('alice', previous!.id))!.glyphs.A.image).toBeTruthy();
  expect(screen.queryByText('Saved with editable drawings to My fonts.')).toBeNull();
});

test('opening a cloud font with the same draft id preserves unsaved local drawings', async () => {
  const local = (await loadProject('alice'))!;
  local.familyName = 'Unsaved local changes';
  await saveProject(local, 'alice');
  const remote = { ...local, familyName: 'Cloud version' };
  vi.mocked(api.listMyFonts).mockResolvedValue([saved('cloud-font', 'Cloud version')]);
  vi.mocked(api.fetchFontProject).mockResolvedValue(remote);
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  await screen.findByText('Opened Cloud version. Your previous draft is kept in My fonts on this browser.');
  const active = (await loadProject('alice'))!;
  expect(active.familyName).toBe('Cloud version');
  expect(active.libraryId).toBe('cloud-font');
  expect(active.draftId).not.toBe(local.draftId);
  expect((await loadDraft('alice', local.draftId))!.familyName).toBe('Unsaved local changes');
});


test('a single drawn character can be downloaded from the specimen', async () => {
  window.location.hash = '/specimen';
  vi.mocked(assembleFont).mockResolvedValue({ buffer: fontFixture(['A']), covered: ['A'] });
  const blobs: Blob[] = [];
  const downloads: string[] = [];
  URL.createObjectURL = (blob: Blob | MediaSource) => { blobs.push(blob as Blob); return 'blob:download'; };
  URL.revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Download AliceDraft.otf' }));
  await waitFor(() => expect(downloads).toEqual(['AliceDraft.otf']));
  expect(blobs[0].type).toBe('font/otf');
});
