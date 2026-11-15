import { CHARSET, DEFAULT_SAMPLE } from './spec.js';
import type { Glyph, Project } from './types.js';

export function emptyGlyph(): Glyph {
  return { image: null, rev: 0, offsetX: 0 };
}

export function emptyProject(): Project {
  return {
    draftId: crypto.randomUUID(),
    familyName: 'My Hand',
    author: '',
    sampleText: DEFAULT_SAMPLE,
    glyphs: Object.fromEntries(CHARSET.map((char) => [char, emptyGlyph()])),
    libraryId: null,
  };
}

/** Supplies defaults for drafts written before spacing and multiple drafts existed. */
export function normalizeProject(raw: Partial<Project> | null | undefined): Project {
  const base = emptyProject();
  if (!raw) return base;
  for (const char of CHARSET) {
    const glyph = raw.glyphs?.[char];
    if (!glyph) continue;
    base.glyphs[char] = {
      image: typeof glyph.image === 'string' ? glyph.image : null,
      rev: Number.isFinite(glyph.rev) ? glyph.rev : 0,
      offsetX: Number.isFinite(glyph.offsetX) ? Math.max(-240, Math.min(240, glyph.offsetX)) : 0,
    };
  }
  return {
    ...base,
    draftId: typeof raw.draftId === 'string' && raw.draftId.length <= 64 ? raw.draftId : base.draftId,
    familyName: typeof raw.familyName === 'string' ? raw.familyName.slice(0, 40) : base.familyName,
    author: typeof raw.author === 'string' ? raw.author.slice(0, 60) : '',
    sampleText: typeof raw.sampleText === 'string' ? raw.sampleText.slice(0, 400) : base.sampleText,
    libraryId: typeof raw.libraryId === 'string' ? raw.libraryId : null,
  };
}
