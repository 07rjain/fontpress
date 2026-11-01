import { beforeEach, expect, test, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { emptyProject, listDrafts, loadDraft, loadProject, saveProject } from '../src/storage';

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

test('starting and switching drafts preserves each editable project under the correct account', async () => {
  const first = emptyProject(); first.familyName = 'First';
  first.glyphs.A = { image: 'drawing-A', rev: 7, offsetX: 30 };
  await saveProject(first, 'alice');
  const second = emptyProject(); second.familyName = 'Second';
  await saveProject(second, 'alice');
  expect((await loadProject('alice'))!.draftId).toBe(second.draftId);
  expect((await listDrafts('alice')).map((draft) => draft.name).sort()).toEqual(['First', 'Second']);
  expect((await loadDraft('alice', first.draftId))!.glyphs.A).toEqual({ image: 'drawing-A', rev: 7, offsetX: 30 });
  expect(await listDrafts('bob')).toEqual([]);
  expect(await loadDraft('bob', first.draftId)).toBeNull();
  await saveProject((await loadDraft('alice', first.draftId))!, 'alice');
  expect((await loadProject('alice'))!.familyName).toBe('First');
});

test('pre-sign-in legacy drafts migrate only to the first account and gain spacing defaults', async () => {
  const db = await new Promise<IDBDatabase>((resolve) => {
    const request = indexedDB.open('handpress', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('kv');
    request.onsuccess = () => resolve(request.result);
  });
  await new Promise<void>((resolve) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put({ v: 1, project: { familyName: 'Legacy', glyphs: { A: { image: 'ink', rev: 1 } } } }, 'project');
    tx.oncomplete = () => resolve();
  });
  db.close();
  const [migrated, other] = await Promise.all([loadProject('alice'), loadProject('bob')]);
  expect(migrated!.familyName).toBe('Legacy');
  expect(migrated!.glyphs.A.offsetX).toBe(0);
  expect(migrated!.draftId).toBeTruthy();
  expect(other).toBeNull();
});


test('a storage failure is reported rather than mistaken for a missing draft', async () => {
  vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new Error('Storage unavailable'); });
  await expect(loadProject('alice')).rejects.toThrow('Storage unavailable');
});
