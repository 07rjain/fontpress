import { useEffect } from 'react';
import { CHARSET, GROUPS, charLabel } from '../spec';
import type { Glyph } from '../types';

type Props = {
  active: string;
  glyphs: Record<string, Glyph>;
  onPick: (char: string) => void;
};

export function Rail({ active, glyphs, onPick }: Props) {
  const filled = CHARSET.filter((char) => glyphs[char]?.image).length;

  useEffect(() => {
    const key = document.getElementById(`key-${CHARSET.indexOf(active)}`);
    const rail = key?.closest<HTMLElement>('.rail');
    const groups = key?.closest<HTMLElement>('.rail-groups');
    if (!key || !rail || !groups) return;
    const box = key.getBoundingClientRect();
    const railBox = rail.getBoundingClientRect();
    const groupBox = groups.getBoundingClientRect();
    if (box.top < railBox.top) rail.scrollTop -= railBox.top - box.top + 12;
    else if (box.bottom > railBox.bottom) rail.scrollTop += box.bottom - railBox.bottom + 12;
    if (box.left < groupBox.left) groups.scrollLeft -= groupBox.left - box.left + 12;
    else if (box.right > groupBox.right) groups.scrollLeft += box.right - groupBox.right + 12;
  }, [active]);

  return (
    <aside className="rail">
      <div className="rail-head">
        <h2>Letters</h2>
        <p>
          {filled} of {CHARSET.length}
        </p>
      </div>
      <div className="rail-groups">
        {GROUPS.map((group) => (
          <section key={group.id} className="group">
            <h3>{group.label}</h3>
            <div className="keys" role="listbox" aria-label={group.label}>
              {group.chars.map((char) => {
                const index = CHARSET.indexOf(char);
                const image = glyphs[char]?.image;
                const isActive = char === active;
                return (
                  <button
                    key={char}
                    id={`key-${index}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    aria-label={charLabel(char)}
                    title={charLabel(char)}
                    className={isActive ? 'key active' : image ? 'key filled' : 'key'}
                    onClick={() => onPick(char)}
                  >
                    {image ? <img src={image} alt="" /> : <span>{char}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
