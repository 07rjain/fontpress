import { UserButton, useAuth, useClerk } from '@clerk/react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  deleteFont,
  fetchFontFile,
  fetchFontProject,
  listMyFonts,
  saveFont,
  setFontVisibility,
  type SavedFont,
  type Visibility,
} from './api';
import { AuthGate } from './components/AuthGate';
import { AuthStartup } from './components/AuthStartup';
import { Board } from './components/Board';
import { Landing } from './components/Landing';
import { Rail } from './components/Rail';
import type { Busy } from './components/Specimen';
import { Sheets, TemplateScreen } from './components/TemplateScreen';
import { nudgeImage } from './draw';
import {
  assembleFont,
  clearFontCache,
  clearPreview,
  enqueue,
  publishPreview,
  saveFontFile,
  projectFromFont,
} from './font';
import type { LoadedPhoto } from './image';
import {
  CHARSET,
  charLabel,
  fontFileName as downloadName,
  type SheetId,
} from './spec';
import { emptyProject, normalizeProject, loadProject, saveProject, listDrafts, loadDraft, type LocalDraft } from './storage';
import type { Glyph, Project, Tool } from './types';
import { useTaskScope } from './useTaskScope';

const Aligner = lazy(() => import('./components/Aligner').then((m) => ({ default: m.Aligner })));
const Gallery = lazy(() => import('./components/Gallery').then((m) => ({ default: m.Gallery })));
const Library = lazy(() => import('./components/Library').then((m) => ({ default: m.Library })));
const Specimen = lazy(() => import('./components/Specimen').then((m) => ({ default: m.Specimen })));

type UndoEntry =
  | { type: 'glyph'; char: string; glyph: Glyph }
  | { type: 'batch'; glyphs: Record<string, Glyph> };

type Mode = 'home' | 'draw' | 'specimen' | 'template' | 'align' | 'library' | 'gallery';

const MEMBER_TABS: { id: Mode; label: string }[] = [
  { id: 'draw', label: 'Draw' },
  { id: 'specimen', label: 'Specimen' },
  { id: 'template', label: 'Template' },
  { id: 'library', label: 'My fonts' },
  { id: 'gallery', label: 'Gallery' },
];

const PUBLIC_MODES: Mode[] = ['home', 'gallery'];
const ROUTED_MODES: Mode[] = ['draw', 'specimen', 'template', 'library', 'gallery'];

function modeFromHash(): Mode {
  const value = window.location.hash.replace(/^#\/?/, '') as Mode;
  if (value === 'align') return 'template';
  return ROUTED_MODES.includes(value) ? value : 'home';
}

function urlFor(mode: Mode): string {
  const base = `${window.location.pathname}${window.location.search}`;
  return mode === 'home' ? base : `${base}#/${mode === 'align' ? 'template' : mode}`;
}

export function App() {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return <AuthStartup />;
  return <Suspense fallback={<div className="boot"><p>Loading the studio…</p></div>}>
    <Studio key={userId ?? 'guest'} />
  </Suspense>;
}

function Studio() {
  const { isLoaded, isSignedIn, userId, getToken: getAuthToken } = useAuth();
  const { capture: captureAccount } = useTaskScope();
  const { capture: captureDraft, invalidate: invalidateDraft } = useTaskScope();
  const getToken = useCallback(async () => {
    const current = captureAccount();
    const token = await getAuthToken();
    if (!current()) throw new Error('The account changed. Try again.');
    return token;
  }, [captureAccount, getAuthToken]);
  const clerk = useClerk();
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [project, setProject] = useState<Project>(() => emptyProject());
  const [active, setActive] = useState('A');
  const [tool, setTool] = useState<Tool>('pen');
  const [width, setWidth] = useState(18);
  const [mode, setModeState] = useState<Mode>(modeFromHash);
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [note, setNote] = useState('');
  const [covered, setCovered] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [progress, setProgress] = useState('');
  const [canUndo, setCanUndo] = useState(false);
  const [library, setLibrary] = useState<SavedFont[] | null>(null);
  const [libraryError, setLibraryError] = useState('');
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);
  const libraryRequest = useRef(0);
  const busyRef = useRef(false);
  const busyFontRef = useRef(false);
  const [busyFont, setBusyFont] = useState<string | null>(null);
  const undoRef = useRef<UndoEntry[]>([]);
  const projectRef = useRef(project);
  const readyRef = useRef(false);
  const ownerRef = useRef<string | null>(null);
  const photoRef = useRef(photo);
  photoRef.current = photo;
  const fileRef = useRef<HTMLInputElement>(null);
  const letterRef = useRef<HTMLInputElement>(null);
  projectRef.current = project;
  const owner = isLoaded ? (userId ?? null) : undefined;

  useEffect(() => () => { photoRef.current?.bitmap.close(); }, []);

  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    const url = urlFor(next);
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== url) {
      window.history.pushState(null, '', url);
    }
  }, []);

  useEffect(() => {
    const onPop = () => setModeState(modeFromHash());
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
  }, []);

  useEffect(() => {
    if (owner === undefined) return;
    if (readyRef.current && ownerRef.current) {
      void saveProject(projectRef.current, ownerRef.current).catch(() => undefined);
    }
    readyRef.current = false;
    ownerRef.current = null;
    setReady(false);
    setLoadError('');
    undoRef.current = [];
    setCanUndo(false);
    clearFontCache();
    clearPreview();
    setCovered(new Set());
    setLibrary(null);
    setLibraryError('');
    setActive('A');
    if (!owner) {
      setProject(emptyProject());
      readyRef.current = true;
      setReady(true);
      return;
    }
    let cancel = false;
    void loadProject(owner).then((stored) => {
      if (cancel) return;
      ownerRef.current = owner;
      setProject(stored ?? emptyProject());
      readyRef.current = true;
      setReady(true);
    }).catch(() => {
      if (!cancel) setLoadError('Could not read your saved drawings. Retry before starting another draft.');
    });
    return () => {
      cancel = true;
      if (readyRef.current && ownerRef.current) {
        void saveProject(projectRef.current, ownerRef.current).catch(() => undefined);
      }
    };
  }, [owner, loadAttempt]);

  useEffect(() => {
    const current = ownerRef.current;
    if (!ready || !current) return;
    const isCurrent = captureDraft();
    const timer = window.setTimeout(() => {
      void saveProject(project, current).then(() => {
        if (!isCurrent()) return;
        const summary = { id: project.draftId, name: project.familyName,
          filled: CHARSET.filter((char) => project.glyphs[char].image).length, updatedAt: Date.now() };
        setDrafts((value) => [summary, ...value.filter((draft) => draft.id !== summary.id)]);
      }).catch(() => {
        if (isCurrent()) setNote('This browser could not save the drawings. They will last for this visit.');
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [project, ready, captureDraft]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && readyRef.current && ownerRef.current) {
        void saveProject(projectRef.current, ownerRef.current).catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  const refreshLibrary = useCallback(async () => {
    const current = captureAccount();
    const request = ++libraryRequest.current;
    setLibraryError('');
    try {
      const [fonts, local] = await Promise.all([
        listMyFonts(getToken),
        owner ? listDrafts(owner).catch(() => []) : Promise.resolve([]),
      ]);
      if (!current() || request !== libraryRequest.current) return;
      setLibrary(fonts);
      setDrafts(local);
    } catch (err) {
      if (current() && request === libraryRequest.current) setLibraryError(err instanceof Error ? err.message : 'Could not load your fonts.');
    }
  }, [getToken, owner, captureAccount]);

  useEffect(() => {
    if (ready && isSignedIn) void refreshLibrary();
  }, [ready, isSignedIn, refreshLibrary]);

  useEffect(() => {
    if (mode !== 'library' || !owner) return;
    const current = captureAccount();
    void listDrafts(owner).then((local) => { if (current()) setDrafts(local); }).catch(() => undefined);
  }, [mode, owner, captureAccount]);

  useEffect(() => {
    const family = project.familyName.trim();
    document.title = family ? `${family} — Handpress` : 'Handpress — Make a font from your handwriting';
  }, [project.familyName]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [mode]);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(''), 6000);
    return () => window.clearTimeout(timer);
  }, [note]);

  const filled = CHARSET.filter((char) => project.glyphs[char]?.image);
  const activeIndex = CHARSET.indexOf(active);
  const previousChar = CHARSET[(activeIndex - 1 + CHARSET.length) % CHARSET.length];
  const nextChar = CHARSET[(activeIndex + 1) % CHARSET.length];
  const signature = filled.map((char) => `${char}:${project.glyphs[char].rev}:${project.glyphs[char].offsetX}`).join('|');

  useEffect(() => {
    if (!ready) return;
    if (filled.length === 0) {
      clearPreview();
      setCovered(new Set());
      setUpdating(false);
      return;
    }
    let cancelled = false;
    const current = captureDraft();
    const timer = window.setTimeout(() => {
      setUpdating(true);
      void enqueue(async () => {
        if (cancelled || !current()) return;
        const snapshot = CHARSET.map((char) => ({
          char,
          image: projectRef.current.glyphs[char].image,
          rev: projectRef.current.glyphs[char].rev,
          offsetX: projectRef.current.glyphs[char].offsetX,
        }));
        const built = await assembleFont(
          snapshot,
          projectRef.current.familyName,
          projectRef.current.author,
          () => !cancelled && current(),
          () => undefined,
        );
        if (!built || cancelled || !current()) return;
        await publishPreview(built.buffer, () => !cancelled && current());
        if (cancelled || !current()) return;
        setCovered(new Set(built.covered));
        setUpdating(false);
      }).catch(() => {
        if (!cancelled && current()) {
          setUpdating(false);
          setNote('The preview could not be built from these drawings.');
        }
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [signature, ready, filled.length, project.draftId, captureDraft]);

  const commit = useCallback((char: string, image: string | null) => {
    const previous = projectRef.current.glyphs[char]?.image ?? null;
    if (previous === image) return;
    undoRef.current.push({ type: 'glyph', char, glyph: { ...projectRef.current.glyphs[char] } });
    if (undoRef.current.length > 40) undoRef.current.shift();
    setCanUndo(true);
    setProject((current) => ({
      ...current,
      glyphs: {
        ...current.glyphs,
        [char]: { ...current.glyphs[char], image, rev: current.glyphs[char].rev + 1 },
      },
    }));
  }, []);

  const undo = useCallback(() => {
    const entry = undoRef.current.pop();
    setCanUndo(undoRef.current.length > 0);
    if (!entry) return;
    setProject((current) => {
      const glyphs = { ...current.glyphs };
      if (entry.type === 'glyph') {
        glyphs[entry.char] = { ...entry.glyph, rev: glyphs[entry.char].rev + 1 };
        setActive(entry.char);
      } else {
        for (const [char, glyph] of Object.entries(entry.glyphs)) {
          if (!glyphs[char]) continue;
          glyphs[char] = { ...glyph, rev: glyphs[char].rev + 1 };
        }
      }
      return { ...current, glyphs };
    });
  }, []);

  const moveLetter = useCallback((direction: -1 | 1) => {
    setActive((char) => CHARSET[(CHARSET.indexOf(char) + direction + CHARSET.length) % CHARSET.length]);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if (mode !== 'draw' || !ownerRef.current) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        moveLetter(event.key === 'ArrowRight' ? 1 : -1);
      } else if (event.key.toLowerCase() === 'b' && !event.metaKey && !event.ctrlKey) {
        setTool('pen');
      } else if (event.key.toLowerCase() === 'e' && !event.metaKey && !event.ctrlKey) {
        setTool('eraser');
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        commit(active, null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, commit, mode, moveLetter, undo]);

  async function onSheetFile(file: File | undefined) {
    if (!file) return;
    const current = captureDraft();
    setNote('Reading the photo…');
    try {
      const { loadPhotoFile } = await import('./image');
      const loaded = await loadPhotoFile(file);
      if (!current()) { loaded.bitmap.close(); return; }
      setPhoto((current) => {
        current?.bitmap.close?.();
        return loaded;
      });
      setMode('align');
      setNote(
        loaded.detected
          ? 'Lined up the corner squares. Check that each letter sits in the right box.'
          : 'Drag the red handles onto the four black squares.',
      );
    } catch (err) {
      if (current()) setNote(err instanceof Error ? err.message : 'Could not read that photo.');
    }
  }

  async function onLetterFile(file: File | undefined) {
    if (!file) return;
    const current = captureDraft();
    try {
      const { placeLetterPhoto } = await import('./image');
      const image = await placeLetterPhoto(file, active);
      if (!current()) return;
      if (!image) {
        setNote(`No ink found for ${charLabel(active)}. Try a closer photo with a dark pen.`);
        return;
      }
      commit(active, image);
      setMode('draw');
      setNote(`Placed a photo on ${charLabel(active)}.`);
    } catch (err) {
      if (current()) setNote(err instanceof Error ? err.message : 'Could not use that image.');
    }
  }

  function applyImport(images: Record<string, string>) {
    const entries = Object.entries(images);
    if (entries.length === 0) {
      setMode('draw');
      setNote('No new letters were added.');
      return;
    }
    const previous: Record<string, Glyph> = {};
    for (const [char] of entries) previous[char] = { ...projectRef.current.glyphs[char] };
    undoRef.current.push({ type: 'batch', glyphs: previous });
    setCanUndo(true);
    setProject((current) => {
      const glyphs = { ...current.glyphs };
      for (const [char, image] of entries) {
        if (!glyphs[char]) continue;
        glyphs[char] = { image, rev: glyphs[char].rev + 1, offsetX: 0 };
      }
      return { ...current, glyphs };
    });
    const first = CHARSET.find((char) => images[char]);
    if (first) setActive(first);
    setMode('draw');
    setNote(`Imported ${entries.length} letters. Undo puts your previous drawings back.`);
  }

  async function buildCurrentFont(snapshot: Project, current: () => boolean, complete: boolean) {
    setProgress('Making the font…');
    const glyphs = CHARSET.map((char) => ({ char, ...snapshot.glyphs[char] }));
    const built = await enqueue(() => assembleFont(glyphs, snapshot.familyName, snapshot.author, current, (done, total) => {
      if (current()) setProgress(total > 0 ? `Tracing ${done} of ${total}` : 'Making the font…');
    }));
    if (!current()) return null;
    if (!built || built.covered.length === 0) {
      setNote('None of the drawings could be turned into letters. Try a darker stroke.');
      return null;
    }
    setCovered(new Set(built.covered));
    const unfinished = CHARSET.filter((char) => !built.covered.includes(char));
    if (complete && unfinished.length > 0) {
      setNote(`Draw every character before downloading or publishing. Still missing ${unfinished.length}: ${unfinished.slice(0, 12).join(' ')}.`);
      return null;
    }
    return built;
  }

  async function download() {
    if (busyRef.current) return;
    const snapshot = projectRef.current;
    const remaining = CHARSET.filter((char) => !snapshot.glyphs[char]?.image).length;
    if (remaining > 0) {
      setNote(`Finish all ${CHARSET.length} characters before downloading. ${remaining} still to draw.`);
      return;
    }
    const current = captureDraft();
    busyRef.current = true;
    setBusy('download');
    try {
      const built = await buildCurrentFont(snapshot, current, true);
      if (!built || !current()) return;
      saveFontFile(built.buffer, downloadName(snapshot.familyName));
      setNote('Font downloaded. Open the file to install it.');
    } catch (err) {
      if (current()) setNote(err instanceof Error ? err.message : 'Could not build the font.');
    } finally {
      if (current()) { busyRef.current = false; setBusy(null); setProgress(''); }
    }
  }

  async function saveToLibrary(visibility: Visibility) {
    if (busyRef.current || !filled.length) return;
    const snapshot = projectRef.current;
    const current = captureDraft();
    busyRef.current = true;
    setBusy('save');
    try {
      // Capture the token before tracing; never upload an old draft using a later session.
      const token = await getToken();
      if (!current()) return;
      const built = await buildCurrentFont(snapshot, current, visibility === 'public');
      if (!built || !current()) return;
      const tokenSource = async () => {
        if (!current()) throw new Error('The draft changed. Try again.');
        return token;
      };
      setProgress('Uploading…');
      const input = { id: snapshot.libraryId, buffer: built.buffer, project: snapshot,
        name: snapshot.familyName.trim() || 'My Hand', designer: snapshot.author.trim(), visibility };
      let saved: SavedFont;
      try { saved = await saveFont(tokenSource, input); }
      catch (err) {
        if (!current() || !(err instanceof ApiError && err.status === 404 && input.id)) throw err;
        saved = await saveFont(tokenSource, { ...input, id: null });
      }
      if (!current()) return;
      setProject((value) => ({ ...value, libraryId: saved.id }));
      // Invalidate older list responses so they cannot remove the newly saved entry.
      libraryRequest.current++;
      setLibrary((value) => [saved, ...(value ?? []).filter((font) => font.id !== saved.id)]);
      setLibraryError('');
      setNote(visibility === 'public' ? 'Published. Your font is now in the gallery.' : 'Saved with editable drawings to My fonts.');
    } catch (err) {
      if (current()) setNote(err instanceof Error ? err.message : 'Could not save the font.');
    } finally {
      if (current()) { busyRef.current = false; setBusy(null); setProgress(''); }
    }
  }

  async function downloadSaved(font: SavedFont) {
    if (font.glyphCount !== CHARSET.length) {
      setNote(`Finish all ${CHARSET.length} characters before downloading. Choose Edit to continue this font.`);
      return;
    }
    const current = captureAccount();
    try {
      const buffer = await fetchFontFile(font, isSignedIn ? getToken : undefined, true);
      if (current()) saveFontFile(buffer, downloadName(font.name));
    } catch (err) {
      if (current()) setNote(err instanceof Error ? err.message : 'Could not download that font.');
    }
  }

  async function changeVisibility(font: SavedFont, visibility: Visibility) {
    if (busyFontRef.current) return;
    const current = captureAccount();
    busyFontRef.current = true;
    setBusyFont(font.id);
    try {
      const updated = await setFontVisibility(getToken, font.id, visibility);
      if (!current()) return;
      libraryRequest.current++;
      setLibrary((value) => value?.map((item) => item.id === updated.id ? updated : item) ?? null);
      setNote(visibility === 'public' ? `${font.name} is now public.` : `${font.name} is now private.`);
    } catch (err) {
      if (current()) setNote(err instanceof Error ? err.message : 'Could not change that font.');
    } finally {
      if (current()) { busyFontRef.current = false; setBusyFont(null); }
    }
  }

  async function removeSaved(font: SavedFont) {
    if (busyFontRef.current) return;
    const current = captureAccount();
    busyFontRef.current = true;
    setBusyFont(font.id);
    try {
      await deleteFont(getToken, font.id);
      if (!current()) return;
      libraryRequest.current++;
      setLibrary((value) => value?.filter((item) => item.id !== font.id) ?? null);
      if (projectRef.current.libraryId === font.id) setProject((value) => ({ ...value, libraryId: null }));
      setNote(`Deleted ${font.name}.`);
    } catch (err) {
      if (current()) setNote(err instanceof Error ? err.message : 'Could not delete that font.');
    } finally {
      if (current()) { busyFontRef.current = false; setBusyFont(null); }
    }
  }

  function replaceProject(next: Project) {
    invalidateDraft();
    busyRef.current = false;
    setBusy(null);
    setProgress('');
    undoRef.current = [];
    setCanUndo(false);
    clearFontCache();
    clearPreview();
    setCovered(new Set());
    projectRef.current = next;
    setProject(next);
    setActive('A');
    setPhoto((value) => { value?.bitmap.close(); return null; });
    setMode('draw');
  }

  async function openSaved(font: SavedFont) {
    if (busyFontRef.current || !owner) return;
    const current = captureDraft();
    const accountCurrent = captureAccount();
    busyFontRef.current = true;
    setBusyFont(font.id);
    try {
      let next: Project;
      try { next = normalizeProject(await fetchFontProject(getToken, font.id)); }
      catch (err) {
        if (!current() || !(err instanceof ApiError && err.status === 409)) throw err;
        next = await projectFromFont(await fetchFontFile(font, getToken), font.name, font.designer);
      }
      if (!current()) return;
      await saveProject(projectRef.current, owner);
      if (!current()) return;
      const restored = { ...next, draftId: crypto.randomUUID(), libraryId: font.id };
      await saveProject(restored, owner);
      if (!current()) return;
      replaceProject(restored);
      setNote(`Opened ${font.name}. Your previous draft is kept in My fonts on this browser.`);
    } catch (err) {
      if (current()) setNote(err instanceof Error ? err.message : 'Could not open that font.');
    } finally {
      // Replacing a draft invalidates current(), but this account still owns the library action.
      if (accountCurrent()) { busyFontRef.current = false; setBusyFont(null); }
    }
  }

  async function resumeDraft(id: string) {
    if (!owner || busyFontRef.current) return;
    const current = captureDraft();
    const accountCurrent = captureAccount();
    busyFontRef.current = true;
    setBusyFont(id);
    try {
      const next = await loadDraft(owner, id);
      if (!current() || !next) return;
      await saveProject(projectRef.current, owner);
      if (!current()) return;
      await saveProject(next, owner);
      if (!current()) return;
      replaceProject(next);
      setNote(`Resumed ${next.familyName}.`);
    } catch (err) {
      if (current()) setNote(err instanceof Error ? err.message : 'Could not restore the draft.');
    } finally {
      if (accountCurrent()) { busyFontRef.current = false; setBusyFont(null); }
    }
  }

  function returnUrl(next: Mode) {
    return `${window.location.origin}${urlFor(next)}`;
  }

  function openSignIn(next: Mode = 'draw') {
    const url = returnUrl(next);
    clerk.openSignIn({ forceRedirectUrl: url, signUpForceRedirectUrl: url });
  }

  function openSignUp(next: Mode = 'draw') {
    const url = returnUrl(next);
    clerk.openSignUp({ forceRedirectUrl: url, signInForceRedirectUrl: url });
  }

  function go(next: Mode) {
    if (!isSignedIn && !PUBLIC_MODES.includes(next)) {
      openSignUp(next);
      return;
    }
    setMode(next);
  }

  async function startOver() {
    if (!owner || busyFontRef.current) return;
    const current = captureDraft();
    const accountCurrent = captureAccount();
    busyFontRef.current = true;
    try {
      await saveProject(projectRef.current, owner);
      if (!current()) return;
      const next = emptyProject();
      await saveProject(next, owner);
      if (!current()) return;
      replaceProject(next);
      setNote('Started a new font. Your previous draft is kept in My fonts on this browser.');
    } catch {
      if (current()) setNote('Could not keep your current draft. Free some browser storage and try again.');
    } finally {
      if (accountCurrent()) busyFontRef.current = false;
    }
  }

  function nextBlank() {
    const index = CHARSET.indexOf(active);
    for (let step = 1; step <= CHARSET.length; step++) {
      const char = CHARSET[(index + step) % CHARSET.length];
      if (!project.glyphs[char].image) {
        setActive(char);
        return;
      }
    }
    setNote('Every letter has a drawing.');
  }

  function pickLetter(char: string) {
    setActive(char);
    setMode('draw');
  }

  async function nudge(dx: number, dy: number) {
    const char = active;
    const glyph = projectRef.current.glyphs[char];
    if (!glyph.image) return;
    if (dx) {
      const offsetX = Math.max(-240, Math.min(240, glyph.offsetX + dx));
      if (offsetX === glyph.offsetX) return;
      undoRef.current.push({ type: 'glyph', char, glyph: { ...glyph } });
      if (undoRef.current.length > 40) undoRef.current.shift();
      setCanUndo(true);
      setProject((value) => ({ ...value, glyphs: { ...value.glyphs,
        [char]: { ...value.glyphs[char], offsetX, rev: value.glyphs[char].rev + 1 } } }));
      return;
    }
    const current = captureDraft();
    const next = await nudgeImage(glyph.image, 0, dy);
    if (current() && projectRef.current.glyphs[char] === glyph) commit(char, next);
  }


  if (!ready) {
    return (
      <div className="boot">
        <p>{loadError || 'Handpress'}</p>
        {loadError && <button type="button" className="primary" onClick={() => setLoadAttempt((value) => value + 1)}>Retry loading drawings</button>}
      </div>
    );
  }

  const filledSet = new Set(filled);
  const tabFor: Mode = mode === 'align' ? 'template' : mode;
  const gated = !isSignedIn && !PUBLIC_MODES.includes(mode);
  const tabs = isSignedIn ? MEMBER_TABS : MEMBER_TABS.filter((tab) => tab.id === 'gallery');
  const savedFont = library?.find((font) => font.id === project.libraryId) ?? null;
  const scrolls = mode === 'home' || gated;

  return (
    <div className={scrolls ? 'app home' : 'app'}>
      <header className="topbar no-print">
        <button type="button" className="brand" onClick={() => setMode('home')} aria-label="Handpress home">
          <span className="brand-mark" aria-hidden="true">
            H
          </span>
          <span className="brand-name">Handpress</span>
        </button>
        <nav className="tabs" aria-label="Sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={tabFor === tab.id ? 'tab on' : 'tab'}
              aria-current={tabFor === tab.id ? 'page' : undefined}
              onClick={() => setMode(tab.id)}
            >
              {tab.label}
              {tab.id === 'draw' && filled.length > 0 && <small>{filled.length}</small>}
              {tab.id === 'library' && library && library.length > 0 && <small>{library.length}</small>}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          {isSignedIn ? (
            <>
              {mode === 'home' ? (
                <button type="button" className="primary" onClick={() => setMode('draw')}>
                  Open the studio
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  disabled={filled.length !== CHARSET.length || busy !== null}
                  title={filled.length !== CHARSET.length ? `Finish all ${CHARSET.length} characters to download (${filled.length} drawn)` : undefined}
                  onClick={() => void download()}
                >
                  {busy === 'download' ? progress || 'Making the font…' : 'Download font'}
                </button>
              )}
              <UserButton />
            </>
          ) : (
            <>
              <button type="button" className="ghost" onClick={() => openSignIn(mode === 'home' ? 'draw' : mode)}>
                Sign in
              </button>
              <button type="button" className="primary" onClick={() => openSignUp(mode === 'home' ? 'draw' : mode)}>
                Get started
              </button>
            </>
          )}
        </div>
      </header>

      {mode === 'home' && (
        <Landing
          signedIn={Boolean(isSignedIn)}
          filled={filled.length}
          familyName={project.familyName}
          covered={covered}
          onDraw={() => go('draw')}
          onTemplate={() => go('template')}
          onUpload={() => (isSignedIn ? fileRef.current?.click() : go('template'))}
          onSpecimen={() => go('specimen')}
          onGallery={() => setMode('gallery')}
          onDownload={(font) => void downloadSaved(font)}
        />
      )}

      {mode === 'gallery' && (
        <main className="no-print scroll-page">
          <Gallery onDownload={(font) => void downloadSaved(font)} onStart={() => go('draw')} />
        </main>
      )}

      {gated && (
        <AuthGate
          onSignIn={() => openSignIn(mode)}
          onSignUp={() => openSignUp(mode)}
          onGallery={() => setMode('gallery')}
        />
      )}

      {!gated && mode === 'library' && (
        <main className="no-print scroll-page">
          <Library
            fonts={library}
            error={libraryError}
            currentId={project.libraryId}
            currentDraftId={project.draftId}
            drafts={drafts}
            onResume={(id) => void resumeDraft(id)}
            onEdit={(font) => void openSaved(font)}
            busyId={busyFont}
            load={(font) => fetchFontFile(font, getToken)}
            onVisibility={(font, visibility) => void changeVisibility(font, visibility)}
            onDownload={(font) => void downloadSaved(font)}
            onDelete={(font) => void removeSaved(font)}
            onRetry={() => void refreshLibrary()}
            onOpenSpecimen={() => setMode('specimen')}
          />
        </main>
      )}

      {!gated && mode === 'draw' && (
        <main className="workspace no-print">
          <Rail active={active} glyphs={project.glyphs} onPick={setActive} />
          <section className="stage-col">
            <Board
              key={project.draftId}
              char={active}
              label={charLabel(active)}
              image={project.glyphs[active]?.image ?? null}
              tool={tool}
              width={width}
              offsetX={project.glyphs[active].offsetX}
              onCommit={(image) => commit(active, image)}
              onFile={(file) => void onLetterFile(file)}
              navigation={
                <nav className="letter-navigation" aria-label="Letter navigation">
                  <button
                    type="button"
                    className="letter-step"
                    aria-label={`Previous letter: ${charLabel(previousChar)}`}
                    onClick={() => moveLetter(-1)}
                  >
                    <span aria-hidden="true">←</span> Previous
                  </button>
                  <span className="letter-position" aria-live="polite" aria-atomic="true">
                    <span className="sr-only">Letter </span>{activeIndex + 1}
                    <span aria-hidden="true"> / </span><span className="sr-only"> of </span>{CHARSET.length}
                  </span>
                  <button
                    type="button"
                    className="letter-step letter-step-next"
                    aria-label={`Next letter: ${charLabel(nextChar)}`}
                    onClick={() => moveLetter(1)}
                  >
                    Next <span aria-hidden="true">→</span>
                  </button>
                </nav>
              }
              aside={
                <figure className="in-font" aria-label={`${charLabel(active)} in the font`}>
                  <span className={covered.has(active) ? 'mine' : 'gap'}>{active}</span>
                  <figcaption>{covered.has(active) ? 'In the font' : updating ? 'Tracing…' : 'Not yet'}</figcaption>
                </figure>
              }
            />
            <div className="toolbar">
              <div className="tool-group" role="group" aria-label="Drawing tools">
                <button type="button" className={tool === 'pen' ? 'tool on' : 'tool'} aria-pressed={tool === 'pen'} onClick={() => setTool('pen')}>
                  Pen
                </button>
                <button type="button" className={tool === 'eraser' ? 'tool on' : 'tool'} aria-pressed={tool === 'eraser'} onClick={() => setTool('eraser')}>
                  Eraser
                </button>
              </div>
              <div className="pen-size">
                <label htmlFor="pen-size">Size</label>
                <input
                  id="pen-size"
                  type="range"
                  min={8}
                  max={36}
                  value={width}
                  onChange={(event) => setWidth(Number(event.target.value))}
                />
              </div>
              <div className="tool-group" role="group" aria-label="Edit">
                <button type="button" className="tool" disabled={!canUndo} onClick={undo}>
                  Undo
                </button>
                <button type="button" className="tool" disabled={!project.glyphs[active]?.image} onClick={() => commit(active, null)}>
                  Clear
                </button>
              </div>
              <div className="tool-group nudge" role="group" aria-label="Nudge this letter">
                <button type="button" className="tool" disabled={!project.glyphs[active]?.image} onClick={() => void nudge(-10, 0)} aria-label="Nudge left">
                  ←
                </button>
                <button type="button" className="tool" disabled={!project.glyphs[active]?.image} onClick={() => void nudge(0, -10)} aria-label="Nudge up">
                  ↑
                </button>
                <button type="button" className="tool" disabled={!project.glyphs[active]?.image} onClick={() => void nudge(0, 10)} aria-label="Nudge down">
                  ↓
                </button>
                <button type="button" className="tool" disabled={!project.glyphs[active]?.image} onClick={() => void nudge(10, 0)} aria-label="Nudge right">
                  →
                </button>
              </div>
              <button type="button" className="tool" onClick={() => letterRef.current?.click()}>
                Photo of this letter
              </button>
              <span className="spacer" />
              <button type="button" className="ghost" onClick={nextBlank}>
                Next blank →
              </button>
            </div>
            <p className="hint center">
              <kbd>B</kbd> pen · <kbd>E</kbd> eraser · <kbd>←</kbd> <kbd>→</kbd> change letter · <kbd>⌘Z</kbd> undo · drop a picture of this
              letter on the board
            </p>
          </section>
        </main>
      )}

      {!gated && mode === 'specimen' && (
        <main className="no-print scroll-page">
          <Specimen
            familyName={project.familyName}
            author={project.author}
            sampleText={project.sampleText}
            covered={covered}
            filled={filled.length}
            updating={updating}
            busy={busy}
            progress={progress}
            savedFont={savedFont}
            onFamily={(familyName) => setProject((current) => ({ ...current, familyName }))}
            onAuthor={(author) => setProject((current) => ({ ...current, author }))}
            onSample={(sampleText) => setProject((current) => ({ ...current, sampleText }))}
            onPick={pickLetter}
            onDownload={() => void download()}
            onSave={(visibility) => void saveToLibrary(visibility)}
            onOpenLibrary={() => setMode('library')}
            onReset={() => void startOver()}
          />
        </main>
      )}

      {!gated && mode === 'template' && (
        <TemplateScreen onBack={() => setMode('draw')} onUpload={() => fileRef.current?.click()} />
      )}

      {!gated && mode === 'align' && !photo && (
        <TemplateScreen onBack={() => setMode('draw')} onUpload={() => fileRef.current?.click()} />
      )}

      {!gated && mode === 'align' && photo && (
        <Aligner
          photo={photo}
          filled={filledSet}
          onCancel={() => setMode('draw')}
          onSheet={(sheet: SheetId) => setPhoto((current) => (current ? { ...current, sheet } : current))}
          onApply={applyImport}
        />
      )}

      {mode !== 'template' && (
        <div className="print-root" aria-hidden="true">
          <Sheets />
        </div>
      )}

      {note && (
        <p className="toast no-print" role="status">
          {note}
          <button type="button" aria-label="Dismiss" onClick={() => setNote('')}>
            ×
          </button>
        </p>
      )}

      <input
        ref={fileRef}
        className="file"
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          void onSheetFile(file);
        }}
      />
      <input
        ref={letterRef}
        className="file"
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          void onLetterFile(file);
        }}
      />
    </div>
  );
}
