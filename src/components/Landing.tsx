import { useEffect, useState } from 'react';
import { fetchFontFile, listPublicFonts, type SavedFont } from '../api';
import { CHARSET } from '../spec';
import { FontCard, relativeTime } from './FontCard';

type Props = {
  signedIn: boolean;
  filled: number;
  familyName: string;
  covered: Set<string>;
  onDraw: () => void;
  onTemplate: () => void;
  onUpload: () => void;
  onSpecimen: () => void;
  onGallery: () => void;
  onDownload: (font: SavedFont) => void;
};

const FACES = ['serif', 'hand', 'poster', 'sans', 'mono', 'italic'] as const;
const PENNANTS = 22;
const HEADLINERS = 3;

function FestivalLights() {
  return (
    <div className="festival-lights" aria-hidden="true">
      <svg className="festoon" viewBox="0 0 1160 100" fill="none" focusable="false">
        <path className="festoon-wire" d="M0 6 Q580 120 1160 6" />
        {Array.from({ length: 20 }, (_, i) => {
          const t = (i + 0.5) / 20;
          const x = t * 1160;
          const y = 6 + 228 * t * (1 - t);
          return (
            <g key={i} className="festoon-lamp" style={{ '--i': i } as React.CSSProperties}>
              <path className="festoon-drop" d={`M${x} ${y}v8`} />
              <ellipse className="festoon-glow" cx={x} cy={y + 15} rx="19" ry="23" />
              <rect className="festoon-cap" x={x - 2.5} y={y + 7} width="5" height="4" rx="1" />
              <ellipse className="festoon-bulb" cx={x} cy={y + 15} rx="4" ry="6" />
            </g>
          );
        })}
      </svg>
      {[0, 1].map((burst) => (
        <svg key={burst} className={`festival-firework festival-firework-${burst}`} viewBox="0 0 100 100" fill="none" focusable="false">
          <g className="firework-rays">
            {Array.from({ length: 12 }, (_, i) => (
              <g key={i} transform={`rotate(${i * 30} 50 50)`}>
                <path d={`M50 ${i % 2 ? 18 : 10}v${i % 2 ? 9 : 15}`} />
                <circle cx="50" cy={i % 2 ? 10 : 3} r="1.5" fill="currentColor" stroke="none" />
              </g>
            ))}
          </g>
          <path className="firework-star" d="M50 39Q51 49 61 50Q51 51 50 61Q49 51 39 50Q49 49 50 39Z" fill="currentColor" stroke="none" />
        </svg>
      ))}
    </div>
  );
}

const MARQUEE = [
  ['The quick brown fox jumps over the lazy dog', 'serif'],
  ['Sphinx of black quartz, judge my vow', 'hand'],
  ['PACK MY BOX WITH FIVE DOZEN LIQUOR JUGS', 'poster'],
  ['How vexingly quick daft zebras jump', 'mono'],
  ['Every hand is a typeface', 'italic'],
  ['Waltz, bad nymph, for quick jigs vex', 'sans'],
] as const;

const STAGES = [
  {
    stage: 'Stage one',
    venue: 'The drawing tent',
    title: 'Make the letters',
    copy: 'Draw each character on the board with a mouse, trackpad, or pen. Or print the two-page template, fill it in with a black pen, and photograph it.',
  },
  {
    stage: 'Stage two',
    venue: 'The tracing hall',
    title: 'Watch it become type',
    copy: 'Every letter is traced into smooth outlines and sat on a shared baseline. The specimen page sets your own sentences in the font as it grows.',
  },
  {
    stage: 'Stage three',
    venue: 'The print shop',
    title: 'Download, keep, or share',
    copy: 'Download a .otf to install on your computer. Save it to your account privately, or publish it to the gallery so anyone can use it.',
  },
];

export function Landing({
  signedIn,
  filled,
  familyName,
  covered,
  onDraw,
  onTemplate,
  onUpload,
  onSpecimen,
  onGallery,
  onDownload,
}: Props) {
  const started = filled > 0;
  const title = familyName.trim() || 'My Hand';
  const [headliners, setHeadliners] = useState<SavedFont[] | null>(null);

  useEffect(() => {
    let alive = true;
    listPublicFonts().then(
      (list) => alive && setHeadliners(list.slice(0, HEADLINERS)),
      () => alive && setHeadliners([]),
    );
    return () => {
      alive = false;
    };
  }, []);

  const startLabel = started
    ? `Continue · ${filled} of ${CHARSET.length} letters`
    : signedIn
      ? 'Start drawing'
      : 'Get started free';

  return (
    <div className="landing festival">
      <section className="fest-hero">
        <FestivalLights />
        <div className="bunting" aria-hidden="true">
          {Array.from({ length: PENNANTS }, (_, i) => (
            <i key={i} style={{ '--i': i } as React.CSSProperties} />
          ))}
        </div>
        <p className="fest-eyebrow">
          <span>Handpress presents</span>
          <span>Open all year</span>
          <span>Free entry</span>
        </p>
        <h1 className="fest-title">
          <span className="face-serif">A</span> <span className="face-poster">festival</span>{' '}
          <span className="face-italic">of</span> <span className="face-hand">handwriting</span>
        </h1>
        <p className="lede">
          Every hand is a typeface. Write the alphabet once and Handpress traces every letter into a real font you
          can install, type with, and put on the main stage for everyone to download.
        </p>
        <div className="hero-actions">
          <button type="button" className="primary big" onClick={onDraw}>
            {startLabel}
          </button>
          {started ? (
            <button type="button" className="ghost big" onClick={onSpecimen}>
              See the specimen
            </button>
          ) : (
            <button type="button" className="ghost big" onClick={onGallery}>
              See who's playing
            </button>
          )}
        </div>
        <ul className="wristbands" aria-label="What you get">
          <li>{CHARSET.length} characters</li>
          <li>.otf you can install</li>
          <li>Traced in your browser</li>
          <li>Private until you publish</li>
        </ul>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[0, 1].map((copy) => (
            <div className="marquee-set" key={copy}>
              {MARQUEE.map(([text, face]) => (
                <span key={text} className={`face-${face}`}>
                  {text}
                </span>
              ))}
              {covered.size > 0 && <span className="face-yours">{title}</span>}
            </div>
          ))}
        </div>
      </div>

      <section className="fest-parade">
        <header className="fest-head">
          <p className="eyebrow">The parade</p>
          <h2>
            {CHARSET.length} characters. {covered.size > 0 ? `${covered.size} already in your hand.` : 'Every one waiting for your hand.'}
          </h2>
          <p className="lede">
            {covered.size > 0
              ? 'The highlighted letters are yours, set in the font you are drawing right now.'
              : 'Capitals, lowercase, numbers, and the marks that make a sentence. Draw them and they join the parade.'}
          </p>
        </header>
        <ul className="parade">
          {CHARSET.map((char, i) => {
            const yours = covered.has(char);
            return (
              <li
                key={char}
                className={yours ? 'glyph yours' : `glyph face-${FACES[i % FACES.length]} tone-${i % 4}`}
                style={{ '--i': i } as React.CSSProperties}
              >
                {char}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="fest-lineup">
        <header className="fest-head">
          <p className="eyebrow">The programme</p>
          <h2>Three stages, no font software.</h2>
        </header>
        <ol className="lineup">
          {STAGES.map((item, index) => (
            <li key={item.stage} className="lineup-item">
              <div className="lineup-time">
                <span className="lineup-num face-poster">{index + 1}</span>
                <span className="lineup-stage">{item.stage}</span>
                <span className="lineup-venue">{item.venue}</span>
              </div>
              <div className="lineup-body">
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
                <div className="how-links">
                  {index === 0 && (
                    <>
                      <button type="button" className="text-btn" onClick={onDraw}>
                        Open the board
                      </button>
                      <button type="button" className="text-btn" onClick={onTemplate}>
                        Print the template
                      </button>
                    </>
                  )}
                  {index === 1 && (
                    <button type="button" className="text-btn" onClick={onUpload}>
                      Upload a photographed page
                    </button>
                  )}
                  {index === 2 && (
                    <>
                      <button type="button" className="text-btn" onClick={onSpecimen}>
                        Go to the specimen
                      </button>
                      <button type="button" className="text-btn" onClick={onGallery}>
                        See the gallery
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="fest-headliners">
        <header className="fest-head split">
          <div>
            <p className="eyebrow">On the main stage</p>
            <h2>Fonts people have published</h2>
          </div>
          <button type="button" className="ghost" onClick={onGallery}>
            Full lineup
          </button>
        </header>
        {headliners === null && <p className="meta">Warming up the stage…</p>}
        {headliners?.length === 0 && (
          <div className="empty">
            <h2>The stage is empty</h2>
            <p>Be the opening act. Draw your alphabet, then publish it from the Specimen page.</p>
            <button type="button" className="primary" onClick={onDraw}>
              {signedIn ? 'Start drawing' : 'Get started free'}
            </button>
          </div>
        )}
        {headliners && headliners.length > 0 && (
          <div className="card-grid">
            {headliners.map((font) => (
              <FontCard
                key={font.id}
                font={font}
                sample="The quick brown fox jumps over the lazy dog."
                load={() => fetchFontFile(font)}
                byline={`by ${font.designer || font.ownerName} · ${font.glyphCount} of ${CHARSET.length} characters · ${relativeTime(font.updatedAt)}`}
              >
                <button type="button" className="ghost" onClick={() => onDownload(font)}>
                  Download
                </button>
              </FontCard>
            ))}
          </div>
        )}
      </section>

      <section className="fest-ticket">
        <div className="ticket">
          <div className="ticket-stub">
            <span className="face-poster">Admit one</span>
            <span className="ticket-no face-mono">№ {String(CHARSET.length).padStart(4, '0')}</span>
          </div>
          <div className="ticket-body">
            <p className="eyebrow">Your ticket</p>
            <h2>Put your own hand on the bill.</h2>
            <p className="lede">
              Your drawings stay on this device. A font is only uploaded when you save it, and it stays private unless
              you publish it.
            </p>
            <button type="button" className="primary big" onClick={onDraw}>
              {startLabel}
            </button>
          </div>
        </div>
      </section>

      <footer className="landing-foot">
        <span>Handpress</span>
        <span>Letters are traced in your browser. Saved fonts live on Handpress.</span>
        <details className="landing-contact">
          <summary>Contact us <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="m3 5 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></summary>
          <nav aria-label="Contact us">
            <a href="https://calendly.com/07rishabh/quick-call" target="_blank" rel="noreferrer">Book a call</a>
            <a href="https://www.bothrarishabh.com/" target="_blank" rel="noreferrer">Website</a>
            <a href="mailto:07rishabhjain@gmail.com">Email</a>
          </nav>
        </details>
      </footer>
    </div>
  );
}
