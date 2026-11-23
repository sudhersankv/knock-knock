// Inline SVG icons + the companion portrait. All drawn with the ink outline style.
const INK = '#120f1c';

export function svg(markup: string): SVGElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as SVGElement;
}

export const ICON = {
  book: `<svg viewBox="0 0 24 24"><path d="M3 5.5C3 4.7 3.7 4 4.5 4H10c1.1 0 2 .9 2 2v14c0-.8-.7-1.5-1.5-1.5H4.5C3.7 18.5 3 17.8 3 17z" fill="#ffc857" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M21 5.5c0-.8-.7-1.5-1.5-1.5H14c-1.1 0-2 .9-2 2v14c0-.8.7-1.5 1.5-1.5h6c.8 0 1.5-.7 1.5-1.5z" fill="#ffe39a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></svg>`,
  feet: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="${INK}" stroke-width="1.6"><ellipse cx="8" cy="9" rx="3" ry="4.5"/><ellipse cx="16" cy="15" rx="3" ry="4.5"/></svg>`,
  page: `<svg viewBox="0 0 24 24"><path d="M5 3h10l4 4v14H5z" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M8 11h8M8 15h6" stroke="${INK}" stroke-width="2" stroke-linecap="round"/></svg>`,
  heart: `<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></svg>`,
  mic: `<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="${INK}" stroke-width="2"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/></svg>`,
  star: `<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" fill="currentColor" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24"><path d="M4 12h13M12 6l6 6-6 6" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  keyhole: `<svg viewBox="0 0 26 34"><circle cx="13" cy="11" r="9" fill="#fff" stroke="${INK}" stroke-width="3"/><path d="M9 16 L6 31 H20 L17 16" fill="#fff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><circle cx="13" cy="11" r="5.5" fill="#fff"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/></svg>`,
};

/** Stylized companion creature for the HUD medallion (round body, ears, big eyes, tail light). */
let pid = 0;
export function portrait(color: string) {
  const id = `pb${++pid}`;
  return `<svg viewBox="0 0 82 82">
  <defs><radialGradient id="${id}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".35" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".75"/></radialGradient></defs>
  <g class="body">
    <path d="M22 30 L17 12 L33 24 Z" fill="${color}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M60 30 L65 12 L49 24 Z" fill="${color}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <ellipse cx="41" cy="50" rx="26" ry="24" fill="url(#${id})" stroke="${INK}" stroke-width="3"/>
    <ellipse cx="41" cy="60" rx="14" ry="9" fill="#fff" opacity=".35"/>
    <g class="eyes">
      <ellipse cx="32" cy="45" rx="6.5" ry="8" fill="#fff" stroke="${INK}" stroke-width="2.5"/>
      <ellipse cx="50" cy="45" rx="6.5" ry="8" fill="#fff" stroke="${INK}" stroke-width="2.5"/>
      <circle cx="33.5" cy="46.5" r="3.6" fill="${INK}"/><circle cx="51.5" cy="46.5" r="3.6" fill="${INK}"/>
      <circle cx="34.8" cy="44.8" r="1.3" fill="#fff"/><circle cx="52.8" cy="44.8" r="1.3" fill="#fff"/>
    </g>
    <path d="M37 57 q4 3 8 0" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="25" cy="55" r="3" fill="#ff8fa3" opacity=".7"/><circle cx="57" cy="55" r="3" fill="#ff8fa3" opacity=".7"/>
  </g></svg>`;
}

/** Agenda tarot glyphs. */
export const AGENDA_ART: Record<string, { glyph: string; color: string; desc: string }> = {
  faithful: { glyph: '⚓', color: '#2ec4b6', desc: 'Carried your meaning as closely as it could.' },
  poet: { glyph: '✒', color: '#7b5cff', desc: 'Turned everything into metaphor.' },
  jealous: { glyph: '♥', color: '#ff6b5b', desc: 'Didn’t want you two to meet.' },
  literalist: { glyph: '#', color: '#ffc857', desc: 'Refused any word it didn’t know.' },
  gossip: { glyph: '✉', color: '#ff9f43', desc: 'Traded your words for new ones.' },
};
