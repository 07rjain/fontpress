import { UserButton, useAuth, useClerk } from '@clerk/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  deleteFont,
  fetchFontFile,
  listMyFonts,
  saveFont,
  setFontVisibility,
  type SavedFont,
  type Visibility,
} from './api';
import { Aligner } from './components/Aligner';
import { AuthGate } from './components/AuthGate';
import { Board } from './components/Board';
import { Gallery } from './components/Gallery';
import { Landing } from './components/Landing';
import { Library } from './components/Library';
import { Rail } from './components/Rail';
import { Specimen, type Busy } from './components/Specimen';
import { Sheets, TemplateScreen } from './components/TemplateScreen';
import { nudgeImage } from './draw';
import {
  assembleFont,
  clearFontCache,
  clearPreview,
  enqueue,
  publishPreview,
  saveFontFile,
} from './font';
import { loadPhotoFile, placeLetterPhoto, type LoadedPhoto } from './image';
import {
  CHARSET,
  charLabel,
  fontFileName as downloadName,
  type SheetId,
} from './spec';
import { emptyProject, loadProject, saveProject } from './storage';
import type { Project, Tool } from './types';

type UndoEntry =
  | { type: 'glyph'; char: string; image: string | null }
  | { type: 'batch'; images: Record<string, string | null> };

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
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const clerk = useClerk();
  const [ready, setReady] = useState(false);
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
  const [busyFont, setBusyFont] = useState<string | null>(null);
  const undoRef = useRef<UndoEntry[]>([]);
  const projectRef = useRef(project);
  const readyRef = useRef(false);
  const ownerRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const letterRef = useRef<HTMLInputElement>(null);
  projectRef.current = project;
  const owner = isLoaded ? (userId ?? null) : undefined;

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
    });
    return () => {
      cancel = true;
    };
  }, [owner]);

  useEffect(() => {
    const current = ownerRef.current;
    if (!ready || !current) return;
    const timer = window.setTimeout(() => {
      void saveProject(project, current).catch(() => {
        setNote('This browser could not save the drawings. They will last for this visit.');
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [project, ready]);

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
    setLibraryError('');
    try {
      setLibrary(await listMyFonts(getToken));
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : 'Could not load your fonts.');
    }
  }, [getToken]);

  useEffect(() => {
    if (ready && isSignedIn && library === null && !libraryError) void refreshLibrary();
  }, [ready, isSignedIn, library, libraryError, refreshLibrary]);

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
  const signature = filled.map((char) => `${char}:${project.glyphs[char].rev}`).join('|');

  useEffect(() => {
    if (!ready) return;
    if (filled.length === 0) {
      clearPreview();
      setCovered(new Set());
      setUpdating(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setUpdating(true);
      void enqueue(async () => {
        if (cancelled) return;
        const snapshot = CHARSET.map((char) => ({
          char,
          image: projectRef.current.glyphs[char].image,
          rev: projectRef.current.glyphs[char].rev,
        }));
        const built = await assembleFont(
          snapshot,
          projectRef.current.familyName,
          projectRef.current.author,
          () => !cancelled,
          () => undefined,
        );
        if (!built || cancelled) return;
        await publishPreview(built.buffer, () => !cancelled);
        if (cancelled) return;
        setCovered(new Set(built.covered));
        setUpdating(false);
      }).catch(() => {
        if (!cancelled) {
          setUpdating(false);
          setNote('The preview could not be built from these drawings.');
        }
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [signature, ready, filled.length]);

  const commit = useCallback((char: string, image: string | null) => {
    const previous = projectRef.current.glyphs[char]?.image ?? null;
    if (previous === image) return;
    undoRef.current.push({ type: 'glyph', char, image: previous });
    if (undoRef.current.length > 40) undoRef.current.shift();
    setCanUndo(true);
    setProject((current) => ({
      ...current,
      glyphs: {
        ...current.glyphs,
        [char]: { image, rev: current.glyphs[char].rev + 1 },
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
        glyphs[entry.char] = { image: entry.image, rev: glyphs[entry.char].rev + 1 };
        setActive(entry.char);
      } else {
        for (const [char, image] of Object.entries(entry.images)) {
          if (!glyphs[char]) continue;
          glyphs[char] = { image, rev: glyphs[char].rev + 1 };
        }
      }
      return { ...current, glyphs };
    });
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
        const index = CHARSET.indexOf(active);
        const next = event.key === 'ArrowRight' ? index + 1 : index - 1;
        setActive(CHARSET[(next + CHARSET.length) % CHARSET.length]);
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
  }, [active, commit, mode, undo]);

  async function onSheetFile(file: File | undefined) {
    if (!file) return;
    setNote('Reading the photo…');
    try {
      const loaded = await loadPhotoFile(file);
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
      setNote(err instanceof Error ? err.message : 'Could not read that photo.');
    }
  }

  async function onLetterFile(file: File | undefined) {
    if (!file) return;
    try {
      const image = await placeLetterPhoto(file, active);
      if (!image) {
        setNote(`No ink found for ${charLabel(active)}. Try a closer photo with a dark pen.`);
        return;
      }
      commit(active, image);
      setMode('draw');
      setNote(`Placed a photo on ${charLabel(active)}.`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not use that image.');
    }
  }

  function applyImport(images: Record<string, string>) {
    const entries = Object.entries(images);
    if (entries.length === 0) {
      setMode('draw');
      setNote('No new letters were added.');
      return;
    }
    const previous: Record<string, string | null> = {};
    for (const [char] of entries) previous[char] = projectRef.current.glyphs[char]?.image ?? null;
    undoRef.current.push({ type: 'batch', images: previous });
    setCanUndo(true);
    setProject((current) => {
      const glyphs = { ...current.glyphs };
      for (const [char, image] of entries) {
        if (!glyphs[char]) continue;
        glyphs[char] = { image, rev: glyphs[char].rev + 1 };
      }
      return { ...current, glyphs };
    });
    const first = CHARSET.find((char) => images[char]);
    if (first) setActive(first);
    setMode('draw');
    setNote(`Imported ${entries.length} letters. Undo puts your previous drawings back.`);
  }

  async function buildCurrentFont() {
    setProgress('Making the font…');
    const snapshot = CHARSET.map((char) => ({
      char,
      image: projectRef.current.glyphs[char].image,
      rev: projectRef.current.glyphs[char].rev,
    }));
    const built = await enqueue(() =>
      assembleFont(snapshot, projectRef.current.familyName, projectRef.current.author, () => true, (done, total) => {
        setProgress(total > 0 ? `Tracing ${done} of ${total}` : 'Making the font…');
      }),
    );
    if (!built || built.covered.length === 0) {
      setNote('None of the drawings could be turned into letters. Try a darker stroke.');
      return null;
    }
    const unfinished = CHARSET.filter((char) => !built.covered.includes(char));
    if (unfinished.length > 0) {
      const preview = unfinished.slice(0, 12).join(' ');
      setNote(`Draw every character first. Still missing ${unfinished.length}: ${preview}${unfinished.length > 12 ? '…' : ''}.`);
      setCovered(new Set(built.covered));
      return null;
    }
    setCovered(new Set(built.covered));
    return built;
  }

  function alphabetReady(): boolean {
    return CHARSET.every((char) => projectRef.current.glyphs[char]?.image);
  }

  async function download() {
    if (!alphabetReady() || busy) return;
    setBusy('download');
    try {
      const built = await buildCurrentFont();
      if (!built) return;
      saveFontFile(built.buffer, downloadName(projectRef.current.familyName));
      setNote('Font downloaded. Open the file to install it.');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not build the font.');
    } finally {
      setBusy(null);
      setProgress('');
    }
  }

  async function saveToLibrary(visibility: Visibility) {
    if (!alphabetReady() || busy) return;
    setBusy('save');
    try {
      const built = await buildCurrentFont();
      if (!built) return;
      setProgress('Uploading…');
      const input = {
        id: projectRef.current.libraryId,
        buffer: built.buffer,
        name: projectRef.current.familyName.trim() || 'My Hand',
        designer: projectRef.current.author.trim(),
        visibility,
      };
      let saved: SavedFont;
      try {
        saved = await saveFont(getToken, input);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404 && input.id)) throw err;
        saved = await saveFont(getToken, { ...input, id: null });
      }
      setProject((current) => ({ ...current, libraryId: saved.id }));
      setLibrary((current) => current && [saved, ...current.filter((font) => font.id !== saved.id)]);
      setLibraryError('');
      setNote(visibility === 'public' ? 'Published. Your font is now in the gallery.' : 'Saved privately to My fonts.');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not save the font.');
    } finally {
      setBusy(null);
      setProgress('');
    }
  }

  async function downloadSaved(font: SavedFont) {
    try {
      const buffer = await fetchFontFile(font, isSignedIn ? getToken : undefined);
      saveFontFile(buffer, downloadName(font.name));
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not download that font.');
    }
  }

  async function changeVisibility(font: SavedFont, visibility: Visibility) {
    setBusyFont(font.id);
    try {
      const updated = await setFontVisibility(getToken, font.id, visibility);
      setLibrary((current) => current?.map((item) => (item.id === updated.id ? updated : item)) ?? null);
      setNote(visibility === 'public' ? `${font.name} is now public.` : `${font.name} is now private.`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not change that font.');
    } finally {
      setBusyFont(null);
    }
  }

  async function removeSaved(font: SavedFont) {
    setBusyFont(font.id);
    try {
      await deleteFont(getToken, font.id);
      setLibrary((current) => current?.filter((item) => item.id !== font.id) ?? null);
      if (projectRef.current.libraryId === font.id) setProject((current) => ({ ...current, libraryId: null }));
      setNote(`Deleted ${font.name}.`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not delete that font.');
    } finally {
      setBusyFont(null);
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

  function startOver() {
    undoRef.current = [];
    setCanUndo(false);
    clearFontCache();
    clearPreview();
    setCovered(new Set());
    setProject(emptyProject());
    setActive('A');
    setPhoto((current) => {
      current?.bitmap.close?.();
      return null;
    });
    setMode('draw');
    setNote('Started a new font.');
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
    const image = project.glyphs[active]?.image;
    if (!image) return;
    const next = await nudgeImage(image, dx, dy);
    commit(active, next);
  }


  if (!ready) {
    return (
      <div className="boot">
        <p>Handpress</p>
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
              char={active}
              label={charLabel(active)}
              image={project.glyphs[active]?.image ?? null}
              tool={tool}
              width={width}
              onCommit={(image) => commit(active, image)}
              onFile={(file) => void onLetterFile(file)}
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
            onReset={startOver}
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
