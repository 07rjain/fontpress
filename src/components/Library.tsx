import { useState } from 'react';
import type { SavedFont, Visibility } from '../api';
import { CHARSET } from '../spec';
import { FontCard, relativeTime } from './FontCard';
import type { LocalDraft } from '../storage';

type Props = {
  fonts: SavedFont[] | null;
  error: string;
  currentId: string | null;
  currentDraftId: string;
  drafts: LocalDraft[];
  onResume: (id: string) => void;
  onEdit: (font: SavedFont) => void;
  busyId: string | null;
  load: (font: SavedFont) => Promise<ArrayBuffer>;
  onVisibility: (font: SavedFont, visibility: Visibility) => void;
  onDownload: (font: SavedFont) => void;
  onDelete: (font: SavedFont) => void;
  onRetry: () => void;
  onOpenSpecimen: () => void;
};

export function Library({ fonts, error, currentId, currentDraftId, drafts, onResume, onEdit, busyId, load, onVisibility, onDownload, onDelete, onRetry, onOpenSpecimen }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <div className="collection-page">
      <header className="collection-head">
        <div>
          <p className="eyebrow">My fonts</p>
          <h1>Your saved fonts</h1>
          <p className="lede">
            Private fonts are only visible to you. Public fonts appear in the gallery, where anyone can preview and
            download them. Choose Edit to continue drawing a saved font on any device.
          </p>
        </div>
        <button type="button" className="ghost" onClick={onOpenSpecimen}>
          Save the font you're drawing
        </button>
      </header>

      {drafts.length > 0 && <section className="local-drafts" aria-label="Drafts on this browser">
        <h2>Drafts on this browser</h2>
        <p className="meta">These drafts stay on this device. Save privately to keep an editable copy in your account.</p>
        <ul>{drafts.map((draft) => <li key={draft.id}>
          <div><strong>{draft.name}</strong><p className="meta">{draft.filled} characters · {relativeTime(draft.updatedAt)}</p></div>
          <button type="button" className="ghost" disabled={busyId !== null || draft.id === currentDraftId}
            onClick={() => onResume(draft.id)}>{draft.id === currentDraftId ? 'Drawing now' : 'Resume draft'}</button>
        </li>)}</ul>
      </section>}

      {error && (
        <div className="empty">
          <p>{error}</p>
          <button type="button" className="ghost" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {!error && fonts === null && <p className="meta">Loading your fonts…</p>}
      {!error && fonts?.length === 0 && (
        <div className="empty">
          <h2>Nothing saved yet</h2>
          <p>Draw your letters, then open the Preview page and save the font privately or publish it.</p>
          <button type="button" className="primary" onClick={onOpenSpecimen}>
            Go to Preview
          </button>
        </div>
      )}

      {fonts && fonts.length > 0 && (
        <div className="card-grid">
          {fonts.map((font) => {
            const busy = busyId !== null;
            const isPublic = font.visibility === 'public';
            return (
              <FontCard
                key={font.id}
                font={font}
                sample="The quick brown fox jumps over the lazy dog."
                load={() => load(font)}
                byline={`${font.glyphCount} of ${CHARSET.length} characters · updated ${relativeTime(font.updatedAt)}`}
                badges={
                  <>
                    {font.id === currentId && <span className="pill">Drawing now</span>}
                    <span className={isPublic ? 'pill public' : 'pill'}>{isPublic ? 'Public' : 'Private'}</span>
                  </>
                }
              >
                {confirming === font.id ? (
                  <>
                    <span className="meta">Delete this font?</span>
                    <button
                      type="button"
                      className="danger"
                      disabled={busy}
                      onClick={() => {
                        setConfirming(null);
                        onDelete(font);
                      }}
                    >
                      Delete
                    </button>
                    <button type="button" className="ghost" onClick={() => setConfirming(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="primary" disabled={busy} onClick={() => onEdit(font)}>
                      {busyId === font.id ? 'Working…' : 'Edit'}
                    </button>
                    <button type="button" className="ghost" disabled={font.glyphCount !== CHARSET.length}
                      title={font.glyphCount !== CHARSET.length ? `Finish all ${CHARSET.length} characters to download. Choose Edit to continue.` : undefined}
                      onClick={() => onDownload(font)}>
                      Download
                    </button>
                    {font.glyphCount !== CHARSET.length && <span className="meta">Finish all {CHARSET.length} characters to download.</span>}
                    <button
                      type="button"
                      className="ghost"
                      disabled={busy || (!isPublic && font.glyphCount < CHARSET.length)}
                      title={!isPublic && font.glyphCount < CHARSET.length ? 'Finish all characters before publishing' : undefined}
                      onClick={() => onVisibility(font, isPublic ? 'private' : 'public')}
                    >
                      {busy ? 'Saving…' : isPublic ? 'Make private' : 'Make public'}
                    </button>
                    <span className="spacer" />
                    <button type="button" className="text-btn danger-text" onClick={() => setConfirming(font.id)}>
                      Delete
                    </button>
                  </>
                )}
              </FontCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
