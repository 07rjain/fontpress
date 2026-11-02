import { useEffect, useState } from 'react';
import type { SavedFont, Visibility } from '../api';
import { CHARSET, GROUPS, SAMPLES, fontFileName } from '../spec';
import { relativeTime } from './FontCard';

export type Busy = 'download' | 'save' | null;

type Props = {
  familyName: string;
  author: string;
  sampleText: string;
  covered: Set<string>;
  filled: number;
  updating: boolean;
  busy: Busy;
  progress: string;
  savedFont: SavedFont | null;
  onFamily: (value: string) => void;
  onAuthor: (value: string) => void;
  onSample: (value: string) => void;
  onPick: (char: string) => void;
  onDownload: () => void;
  onSave: (visibility: Visibility) => void;
  onOpenLibrary: () => void;
  onReset: () => void;
};

export function Specimen({
  familyName,
  author,
  sampleText,
  covered,
  filled,
  updating,
  busy,
  progress,
  savedFont,
  onFamily,
  onAuthor,
  onSample,
  onPick,
  onDownload,
  onSave,
  onOpenLibrary,
  onReset,
}: Props) {
  const title = familyName.trim() || 'My Hand';
  const [size, setSize] = useState(56);
  const [confirm, setConfirm] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>(savedFont?.visibility ?? 'private');
  const missing = CHARSET.length - covered.size;
  const remaining = CHARSET.length - filled;
  const complete = remaining === 0;

  useEffect(() => {
    if (savedFont) setVisibility(savedFont.visibility);
  }, [savedFont]);

  return (
    <div className="specimen-page">
      <header className="spec-hero">
        <p className="eyebrow">
          Specimen
          {updating ? ' · setting type' : ''}
        </p>
        <h1 className="font-title" aria-label={title}>
          <span aria-hidden="true">
            <RichText text={title} covered={covered} />
          </span>
        </h1>
        <p className="meta">
          {covered.size} of {CHARSET.length} characters in the font
          {filled !== covered.size ? ` · ${filled} drawn` : ''}
          {filled === 0 ? ' · draw a few letters and they will appear here' : ''}
        </p>
      </header>

      <div className="spec-grid">
        <div className="spec-main">
          <div className="size-row">
            <label htmlFor="sample-size">Size</label>
            <input
              id="sample-size"
              type="range"
              min={28}
              max={120}
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
            />
            <span>{size}px</span>
          </div>
          <div className="sample-block" aria-hidden="true" style={{ fontSize: `${size}px` }}>
            <RichText text={sampleText || ' '} covered={covered} />
          </div>
          <label className="field">
            <span>Try a sentence</span>
            <textarea value={sampleText} onChange={(event) => onSample(event.target.value)} rows={3} maxLength={400} />
          </label>
          <div className="picks">
            {SAMPLES.map((sample) => (
              <button key={sample.id} type="button" className="chip-btn" onClick={() => onSample(sample.text)}>
                {sample.label}
              </button>
            ))}
          </div>

          <section className="coverage">
            <div className="coverage-head">
              <h2 className="eyebrow">Characters</h2>
              <p className="meta">
                {missing === 0 ? 'Every character is in the font.' : `${missing} still to draw. Grey letters open the board.`}
              </p>
            </div>
            {GROUPS.map((group) => (
              <div key={group.id} className="coverage-row">
                <h3>{group.label}</h3>
                <div className="alpha" aria-label={group.label}>
                  {group.chars.map((char) => (
                    <button
                      key={char}
                      type="button"
                      className={covered.has(char) ? 'alpha-char mine' : 'alpha-char gap'}
                      onClick={() => onPick(char)}
                    >
                      {char}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </div>

        <aside className="spec-side">
          <div className="panel">
            <h2 className="eyebrow">Font details</h2>
            <label className="field">
              <span>Font name</span>
              <input value={familyName} onChange={(event) => onFamily(event.target.value)} maxLength={40} spellCheck={false} />
            </label>
            <label className="field">
              <span>Designer</span>
              <input value={author} onChange={(event) => onAuthor(event.target.value)} placeholder="Your name" maxLength={60} />
            </label>
            <button type="button" className="primary wide" disabled={!complete || busy !== null} onClick={onDownload}>
              {busy === 'download' ? progress || 'Making the font…' : `Download ${fontFileName(title)}`}
            </button>
            {!complete && (
              <p className="install">
                Finish all {CHARSET.length} characters to download your font. {remaining} still to draw. You can save your progress privately.
              </p>
            )}
            <p className="install">
              Open the file with Font Book on a Mac, or double-click it on Windows. The font then shows up in any
              app.
            </p>
          </div>

          <div className="panel">
            <h2 className="eyebrow">Save to Handpress</h2>
            <div className="choice" role="radiogroup" aria-label="Who can see this font">
              <label className={visibility === 'private' ? 'choice-option on' : 'choice-option'}>
                <input
                  type="radio"
                  name="visibility"
                  checked={visibility === 'private'}
                  onChange={() => setVisibility('private')}
                />
                <span>
                  <strong>Private</strong>
                  <small>Only you can see and continue editing it.</small>
                </span>
              </label>
              <label className={visibility === 'public' ? 'choice-option on' : 'choice-option'}>
                <input
                  type="radio"
                  name="visibility"
                  checked={visibility === 'public'}
                  onChange={() => setVisibility('public')}
                />
                <span>
                  <strong>Public</strong>
                  <small>Listed in the gallery. Anyone can download it.</small>
                </span>
              </label>
            </div>
            <button
              type="button"
              className="ghost wide"
              disabled={filled === 0 || (visibility === 'public' && !complete) || busy !== null}
              onClick={() => onSave(visibility)}
            >
              {busy === 'save'
                ? progress || 'Saving…'
                : savedFont
                  ? visibility === 'public'
                    ? 'Update and publish'
                    : 'Update saved font'
                  : visibility === 'public'
                    ? 'Publish to the gallery'
                    : 'Save privately'}
            </button>
            {visibility === 'public' && !complete && <p className="install">Finish all {CHARSET.length} characters to publish, or choose Private to save your progress.</p>}
            {savedFont && (
              <p className="install">
                Saved {relativeTime(savedFont.updatedAt)} as {savedFont.visibility}.{' '}
                <button type="button" className="text-btn" onClick={onOpenLibrary}>
                  Manage in My fonts
                </button>
              </p>
            )}
          </div>

          <div className="panel quiet">
            {confirm ? (
              <div className="reset-bar">
                <span>Start a new font? Your current drawings will stay in My fonts under drafts on this browser.</span>
                <div className="row">
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      setConfirm(false);
                      onReset();
                    }}
                  >
                    Start new font
                  </button>
                  <button type="button" className="ghost" onClick={() => setConfirm(false)}>
                    Keep drawing
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="text-btn" onClick={() => setConfirm(true)}>
                Start a new font
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export function RichText({ text, covered }: { text: string; covered: Set<string> }) {
  return [...text].map((char, index) => {
    if (char === '\n') return <br key={index} />;
    const known = char === ' ' || covered.has(char);
    return (
      <span key={index} className={known ? 'mine' : 'gap'}>
        {char}
      </span>
    );
  });
}
