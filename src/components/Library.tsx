import { useState } from 'react';
import type { SavedFont, Visibility } from '../api';
import { CHARSET } from '../spec';
import { FontCard, relativeTime } from './FontCard';

type Props = {
  fonts: SavedFont[] | null;
  error: string;
  currentId: string | null;
  busyId: string | null;
  load: (font: SavedFont) => Promise<ArrayBuffer>;
  onVisibility: (font: SavedFont, visibility: Visibility) => void;
  onDownload: (font: SavedFont) => void;
  onDelete: (font: SavedFont) => void;
  onRetry: () => void;
  onOpenSpecimen: () => void;
};

export function Library({ fonts, error, currentId, busyId, load, onVisibility, onDownload, onDelete, onRetry, onOpenSpecimen }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <div className="collection-page">
      <header className="collection-head">
        <div>
          <p className="eyebrow">My fonts</p>
          <h1>Your saved fonts</h1>
          <p className="lede">
            Private fonts are only visible to you. Public fonts appear in the gallery, where anyone can preview and
            download them.
          </p>
        </div>
        <button type="button" className="ghost" onClick={onOpenSpecimen}>
          Save the font you're drawing
        </button>
      </header>

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
          <p>Draw your letters, then open the Specimen page and save the font privately or publish it.</p>
          <button type="button" className="primary" onClick={onOpenSpecimen}>
            Go to the specimen
          </button>
        </div>
      )}

      {fonts && fonts.length > 0 && (
        <div className="card-grid">
          {fonts.map((font) => {
            const busy = busyId === font.id;
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
                    <button type="button" className="ghost" onClick={() => onDownload(font)}>
                      Download
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={busy}
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
