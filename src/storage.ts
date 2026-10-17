import { CHARSET, DEFAULT_SAMPLE } from './spec';
import type { Glyph, Project } from './types';

const DB_NAME = 'handpress';
const STORE = 'kv';
const LEGACY_KEY = 'project';

type Stored = { v: 1; project: Project };

export function emptyGlyph(): Glyph {
  return { image: null, rev: 0 };
}

export function emptyProject(): Project {
  const glyphs: Record<string, Glyph> = {};
  for (const char of CHARSET) glyphs[char] = emptyGlyph();
  return {
    familyName: 'My Hand',
    author: '',
    sampleText: DEFAULT_SAMPLE,
    glyphs,
    libraryId: null,
  };
}

export function normalizeProject(raw: Partial<Project> | null | undefined): Project {
  const base = emptyProject();
  if (!raw) return base;
  const glyphs = { ...base.glyphs };
  for (const char of CHARSET) {
    const glyph = raw.glyphs?.[char];
    if (!glyph) continue;
    glyphs[char] = {
      image: typeof glyph.image === 'string' ? glyph.image : null,
      rev: Number.isFinite(glyph.rev) ? glyph.rev : 0,
    };
  }
  return {
    familyName: typeof raw.familyName === 'string' ? raw.familyName : base.familyName,
    author: typeof raw.author === 'string' ? raw.author : '',
    sampleText: typeof raw.sampleText === 'string' ? raw.sampleText : base.sampleText,
    glyphs,
    libraryId: typeof raw.libraryId === 'string' ? raw.libraryId : null,
  };
}

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
  try {
    const db = await openDb();
    let stored = await read(db, keyFor(userId));
    if (!stored) {
      const legacy = await read(db, LEGACY_KEY);
      if (legacy?.v === 1) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(legacy, keyFor(userId));
          tx.objectStore(STORE).delete(LEGACY_KEY);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        stored = legacy;
      }
    }
    db.close();
    if (!stored || stored.v !== 1) return null;
    return normalizeProject(stored.project);
  } catch {
    return null;
  }
}

export async function saveProject(project: Project, userId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ v: 1, project } satisfies Stored, keyFor(userId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
