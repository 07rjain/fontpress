import { CHARSET } from './spec';
import { normalizeProject } from './project';
import type { Project } from './types';
export { emptyProject, normalizeProject } from './project';

const DB_NAME = 'handpress';
const STORE = 'kv';
const LEGACY_KEY = 'project';

type Stored = { v: 1; project: Project; updatedAt?: number };
export type LocalDraft = { id: string; name: string; filled: number; updatedAt: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open storage.'));
  });
}

function keyFor(userId: string) {
  return `project:${userId}`;
}

function read(db: IDBDatabase, key: string): Promise<Stored | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as Stored | undefined);
    request.onerror = () => reject(request.error);
  });
}

/** Loads one user's drafts. Drafts saved before sign-in existed move to the first account that loads them. */
export async function loadProject(userId: string): Promise<Project | null> {
  const db = await openDb();
  try {
    const stored = await new Promise<Stored | undefined>((resolve, reject) => {
      // Read and claim the legacy draft in one transaction so two accounts cannot both adopt it.
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      let result: Stored | undefined;
      const request = store.get(keyFor(userId));
      const keep = (value: Stored | undefined, legacy: boolean) => {
        result = value;
        if (value?.v !== 1) return;
        if (legacy || !value.project.draftId) {
          result = { ...value, project: normalizeProject(value.project), updatedAt: value.updatedAt ?? Date.now() };
          store.put(result, keyFor(userId));
          store.put(result, `draft:${userId}:${result.project.draftId}`);
          if (legacy) store.delete(LEGACY_KEY);
        }
      };
      request.onsuccess = () => {
        if (request.result) keep(request.result, false);
        else {
          const legacy = store.get(LEGACY_KEY);
          legacy.onsuccess = () => keep(legacy.result, true);
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Loading the draft was interrupted.'));
    });
    if (!stored || stored.v !== 1) return null;
    return normalizeProject(stored.project);
  } finally { db.close(); }
}

export async function saveProject(project: Project, userId: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const stored = { v: 1, project, updatedAt: Date.now() } satisfies Stored;
      tx.objectStore(STORE).put(stored, keyFor(userId));
      tx.objectStore(STORE).put(stored, `draft:${userId}:${project.draftId}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Saving the draft was interrupted.'));
    });
  } finally { db.close(); }
}

export async function listDrafts(userId: string): Promise<LocalDraft[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).openCursor();
      const drafts: LocalDraft[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve(drafts.sort((a, b) => b.updatedAt - a.updatedAt));
        if (String(cursor.key).startsWith(`draft:${userId}:`)) {
          const stored = cursor.value as Stored;
          const project = normalizeProject(stored.project);
          drafts.push({ id: project.draftId, name: project.familyName, updatedAt: stored.updatedAt ?? 0,
            filled: CHARSET.filter((char) => project.glyphs[char].image).length });
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function loadDraft(userId: string, id: string): Promise<Project | null> {
  const db = await openDb();
  try {
    const stored = await read(db, `draft:${userId}:${id}`);
    return stored?.v === 1 ? normalizeProject(stored.project) : null;
  } finally { db.close(); }
}
