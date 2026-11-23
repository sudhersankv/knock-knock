import type { HudApi, LobbyResult } from '../contracts';
import type { HatStyle, MatchInfo, PlayerInfo } from '../../shared/protocol';
import { CREW_COLORS } from '../../shared/constants';
import { PAL } from '../render/palette';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const pickOf = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

const LS_NAME = 'riot.name';
const LS_COLOR = 'riot.color';
const LS_HAT = 'riot.hat';
const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

const HATS: HatStyle[] = ['cap', 'beanie', 'mohawk', 'buns', 'none'];
const TOPS = [PAL.magenta, PAL.cyan, PAL.yellow, PAL.orange, PAL.violet, PAL.green, PAL.white, PAL.teal, PAL.red, PAL.ink];
const BOTTOMS = [PAL.ink, PAL.inkSoft, PAL.tealDark, PAL.metalDark, PAL.violet, PAL.brickDark, PAL.blandBrown, PAL.cyan];
const SHOES = [PAL.white, PAL.yellow, PAL.magenta, PAL.cyan, PAL.red, PAL.green, PAL.orange, PAL.ink];
const NAMES = ['NOVA', 'GRAVY', 'DRIP', 'ZIGGY', 'KRANK', 'MOJO', 'PIXIE', 'YAM', 'BOLT', 'FIZZ', 'TURBO', 'PICKLE', 'SPROCKET', 'JUNI', 'RAZZ'];

interface MarkerEls {
  root: HTMLDivElement;
  dist: HTMLSpanElement;
  last: string;
}

export class Hud implements HudApi {
  private ui: HTMLElement;
  private lobby: HTMLDivElement | null = null;

  private hud: HTMLDivElement;
  private scoreEl: HTMLDivElement;
  private scoreTarget = 0;
  private scoreShown = 0;
  private scoreLastText = '';
  private tagsText: HTMLSpanElement;
  private tagsFill: HTMLDivElement;
  private timerEl: HTMLDivElement;
  private timerLast = -1;
  private playersEl: HTMLDivElement;
  private playersSig = '';
  private feedEl: HTMLDivElement;
  private promptEl: HTMLDivElement;
  private promptLast: string | null = null;
  private ringWrap: HTMLDivElement;
  private ringCircle: SVGCircleElement;
  private ringVisible = false;
  private popLayer: HTMLDivElement;
  private markerLayer: HTMLDivElement;
  private markers = new Map<string, MarkerEls>();
  private overEl: HTMLDivElement;
  private lastPlayers: PlayerInfo[] = [];
  private selfId = '';
  private phase: MatchInfo['phase'] = 'lobby';

  constructor(root: HTMLElement = document.getElementById('ui')!) {
    this.ui = root;

    this.hud = el('div', 'hud hidden');

    // score
    const scoreBox = el('div', 'hud-score sticker');
    scoreBox.append(el('div', 'hud-label', 'SCORE'));
    this.scoreEl = el('div', 'hud-score-num', '0');
    scoreBox.append(this.scoreEl);
    const tagsBox = el('div', 'hud-tags');
    this.tagsText = el('span', 'hud-tags-text', 'TAGS 0/0');
    const meter = el('div', 'hud-meter');
    this.tagsFill = el('div', 'hud-meter-fill');
    meter.append(this.tagsFill);
    tagsBox.append(this.tagsText, meter);
    scoreBox.append(tagsBox);

    // timer
    this.timerEl = el('div', 'hud-timer sticker', '8:00');

    // players
    this.playersEl = el('div', 'hud-players');

    // feed
    this.feedEl = el('div', 'hud-feed');

    // prompt
    this.promptEl = el('div', 'hud-prompt hidden');

    // spray ring
    this.ringWrap = el('div', 'hud-ring hidden');
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    const bg = document.createElementNS(svgNS, 'circle');
    bg.setAttribute('cx', '50');
    bg.setAttribute('cy', '50');
    bg.setAttribute('r', '40');
    bg.setAttribute('class', 'ring-bg');
    this.ringCircle = document.createElementNS(svgNS, 'circle');
    this.ringCircle.setAttribute('cx', '50');
    this.ringCircle.setAttribute('cy', '50');
    this.ringCircle.setAttribute('r', '40');
    this.ringCircle.setAttribute('class', 'ring-fg');
    svg.append(bg, this.ringCircle);
    this.ringWrap.append(svg, el('div', 'ring-label', 'SPRAY'));

    this.popLayer = el('div', 'hud-pops');
    this.markerLayer = el('div', 'hud-markers');
    const crosshair = el('div', 'hud-crosshair');

    this.overEl = el('div', 'hud-over hidden');

    this.hud.append(this.markerLayer, scoreBox, this.timerEl, this.playersEl, this.feedEl, this.promptEl, this.ringWrap, crosshair, this.popLayer);
    this.ui.append(this.hud, this.overEl);
  }

  // ------------------------------------------------------------------ lobby
  showLobby(defaults: LobbyResult): Promise<LobbyResult> {
    const look = { ...defaults.look };
    const savedColor = Number(lsGet(LS_COLOR));
    if (savedColor && (CREW_COLORS as readonly number[]).includes(savedColor)) look.accent = savedColor;
    const savedHat = lsGet(LS_HAT) as HatStyle | null;
    if (savedHat && HATS.includes(savedHat)) look.hat = savedHat;
    let name = lsGet(LS_NAME) || defaults.name || pickOf(NAMES);

    this.lobby?.remove();
    const L = el('div', 'lobby');
    L.innerHTML = `
      <div class="lobby-bg"></div>
      <div class="lobby-stripes"></div>
      <div class="lobby-inner">
        <div class="logo-wrap">
          <div class="logo" data-text="COLOR RIOT">COLOR RIOT</div>
          <div class="logo-sub">Neo-Gobble City · Thanksgiving Night</div>
        </div>
        <div class="lobby-cols">
          <div class="lobby-story sticker tilt-l">
            <div class="sticker-head">THE SITUATION</div>
            <p><b>BLANDCO</b>, makers of the world's most okay gravy, bought the whole city and painted every wall
            <span class="beige">beige</span> for their <i>“Thanksgiving of Beige”</i> parade.</p>
            <p>The giant inflatable turkey floats at dawn. Your crew has <b>one night</b> to skate, grind and tag
            the city back to life. Every piece you throw up brings the <span class="rainbow">color</span> back.</p>
            <p class="small">Warning: BLANDCO's turkey blimp is watching. Probably. It's a balloon.</p>
          </div>
          <div class="lobby-card sticker tilt-r">
            <div class="sticker-head">YOUR WRITER</div>
            <label class="field-label">TAG NAME</label>
            <input class="name-input" maxlength="16" spellcheck="false" />
            <label class="field-label">CREW COLOR</label>
            <div class="swatches"></div>
            <label class="field-label">HEADWEAR</label>
            <div class="hats"></div>
            <div class="lobby-actions">
              <button class="btn btn-ghost randomize">🎲 SHUFFLE FIT</button>
              <button class="btn btn-play">PLAY ▶</button>
            </div>
          </div>
          <div class="lobby-controls sticker tilt-l2">
            <div class="sticker-head">CONTROLS</div>
            <ul>
              <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> skate</li>
              <li><kbd>MOUSE</kbd> look</li>
              <li><kbd>SPACE</kbd> jump / ollie</li>
              <li><kbd>SHIFT</kbd> boost</li>
              <li><kbd>E</kbd> hold to tag</li>
              <li><kbd>C</kbd> trick in air</li>
              <li>Land on a rail to <b>grind</b></li>
            </ul>
          </div>
        </div>
      </div>`;
    this.ui.append(L);
    this.lobby = L;

    const input = L.querySelector<HTMLInputElement>('.name-input')!;
    input.value = name;
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9 _\-!?.]/g, '');
      name = input.value;
    });

    const logo = L.querySelector<HTMLDivElement>('.logo')!;
    const applyAccent = () => {
      L.style.setProperty('--accent', hex(look.accent));
      logo.style.setProperty('--accent', hex(look.accent));
    };

    const sw = L.querySelector<HTMLDivElement>('.swatches')!;
    for (const c of CREW_COLORS) {
      const b = el('button', 'swatch');
      b.style.background = hex(c);
      b.title = hex(c);
      if (c === look.accent) b.classList.add('on');
      b.onclick = () => {
        look.accent = c;
        sw.querySelectorAll('.swatch').forEach((s) => s.classList.remove('on'));
        b.classList.add('on');
        applyAccent();
      };
      sw.append(b);
    }
    const hats = L.querySelector<HTMLDivElement>('.hats')!;
    for (const h of HATS) {
      const b = el('button', 'hat-btn', h.toUpperCase());
      if (h === look.hat) b.classList.add('on');
      b.onclick = () => {
        look.hat = h;
        hats.querySelectorAll('.hat-btn').forEach((s) => s.classList.remove('on'));
        b.classList.add('on');
      };
      hats.append(b);
    }
    L.querySelector<HTMLButtonElement>('.randomize')!.onclick = () => {
      look.skin = pickOf(PAL.skinTones);
      look.hair = pickOf(PAL.hairColors);
      look.top = pickOf(TOPS);
      look.bottom = pickOf(BOTTOMS);
      look.shoes = pickOf(SHOES);
      look.seed = (Math.random() * 2 ** 31) | 0;
      if (!input.value.trim()) {
        input.value = pickOf(NAMES);
        name = input.value;
      }
      this.pop('FRESH FIT!', look.accent);
    };
    applyAccent();

    return new Promise((resolve) => {
      const go = () => {
        const finalName = (name.trim() || pickOf(NAMES)).slice(0, 16);
        lsSet(LS_NAME, finalName);
        lsSet(LS_COLOR, String(look.accent));
        lsSet(LS_HAT, look.hat);
        resolve({ name: finalName, look: { ...look } });
      };
      L.querySelector<HTMLButtonElement>('.btn-play')!.onclick = go;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') go();
        e.stopPropagation();
      });
      setTimeout(() => input.focus(), 50);
    });
  }

  hideLobby() {
    if (!this.lobby) return;
    const L = this.lobby;
    this.lobby = null;
    L.classList.add('out');
    setTimeout(() => L.remove(), 450);
    this.hud.classList.remove('hidden');
  }

  // ------------------------------------------------------------------ hud
  setScore(score: number) {
    if (score > this.scoreTarget) {
      this.scoreEl.classList.remove('bump');
      void this.scoreEl.offsetWidth;
      this.scoreEl.classList.add('bump');
    }
    this.scoreTarget = score;
    if (score < this.scoreShown) this.scoreShown = score;
  }

  setTagProgress(tagged: number, total: number) {
    const t = `TAGS ${tagged}/${total}`;
    if (this.tagsText.textContent !== t) {
      this.tagsText.textContent = t;
      this.tagsFill.style.width = `${total ? (tagged / total) * 100 : 0}%`;
    }
  }

  setTimer(secondsLeft: number) {
    const s = Math.max(0, Math.ceil(secondsLeft));
    if (s === this.timerLast) return;
    this.timerLast = s;
    this.timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.timerEl.classList.toggle('urgent', s <= 30 && s > 0);
  }

  setSprayProgress(p: number | null) {
    if (p === null) {
      if (this.ringVisible) {
        this.ringWrap.classList.add('hidden');
        this.ringVisible = false;
      }
      return;
    }
    if (!this.ringVisible) {
      this.ringWrap.classList.remove('hidden');
      this.ringVisible = true;
    }
    const C = 2 * Math.PI * 40;
    this.ringCircle.style.strokeDasharray = `${C}`;
    this.ringCircle.style.strokeDashoffset = `${C * (1 - Math.min(1, Math.max(0, p)))}`;
  }

  setPrompt(text: string | null) {
    if (text === this.promptLast) return;
    this.promptLast = text;
    if (text === null) {
      this.promptEl.classList.add('hidden');
      return;
    }
    // [E] style keys become kbd chips
    this.promptEl.innerHTML = esc(text).replace(/\[([^\]]+)\]/g, '<kbd>$1</kbd>');
    this.promptEl.classList.remove('hidden');
  }

  pop(text: string, color: number = PAL.yellow) {
    const p = el('div', 'pop');
    p.textContent = text;
    p.style.setProperty('--c', hex(color));
    p.style.setProperty('--rot', `${(Math.random() * 14 - 7).toFixed(1)}deg`);
    p.style.setProperty('--dx', `${(Math.random() * 120 - 60).toFixed(0)}px`);
    this.popLayer.append(p);
    while (this.popLayer.childElementCount > 5) this.popLayer.firstElementChild!.remove();
    setTimeout(() => p.remove(), 1500);
  }

  feed(html: string) {
    const line = el('div', 'feed-line', html);
    this.feedEl.append(line);
    while (this.feedEl.childElementCount > 6) this.feedEl.firstElementChild!.remove();
    setTimeout(() => line.classList.add('fade'), 5500);
    setTimeout(() => line.remove(), 6200);
  }

  setPlayers(players: PlayerInfo[], selfId: string) {
    this.lastPlayers = players;
    this.selfId = selfId;
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const sig = selfId + '|' + sorted.map((p) => `${p.id}:${p.name}:${p.score}:${p.look.accent}`).join(',');
    if (sig === this.playersSig) return;
    this.playersSig = sig;
    this.playersEl.innerHTML = sorted
      .map(
        (p, i) =>
          `<div class="chip ${p.id === selfId ? 'me' : ''}" style="--c:${hex(p.look.accent)};--i:${i}">
            <span class="chip-dot"></span><span class="chip-name">${esc(p.name)}</span><span class="chip-score">${p.score.toLocaleString()}</span>
          </div>`,
      )
      .join('');
    if (this.phase === 'over') this.renderOver();
  }

  setMatch(m: MatchInfo) {
    this.setTimer(m.timeLeft);
    if (m.phase === this.phase) return;
    this.phase = m.phase;
    if (m.phase === 'over') {
      this.renderOver();
      this.overEl.classList.remove('hidden');
    } else {
      this.overEl.classList.add('hidden');
    }
  }

  private renderOver() {
    const sorted = [...this.lastPlayers].sort((a, b) => b.score - a.score);
    const medals = ['👑', '🥈', '🥉'];
    this.overEl.innerHTML = `
      <div class="over-card sticker">
        <div class="over-sun"></div>
        <div class="over-title">SUNRISE!</div>
        <div class="over-sub">FINAL SCORES</div>
        <ol class="over-list">
          ${sorted
            .map(
              (p, i) => `<li class="${p.id === this.selfId ? 'me' : ''}" style="--c:${hex(p.look.accent)};--i:${i}">
                <span class="rank">${medals[i] ?? '#' + (i + 1)}</span>
                <span class="nm">${esc(p.name)}</span>
                <span class="sc">${p.score.toLocaleString()}</span></li>`,
            )
            .join('')}
        </ol>
        <div class="over-foot">The parade's ruined. Gravy everywhere. A new night begins shortly…</div>
      </div>`;
  }

  setMarkers(list: { id: string; x: number; y: number; onScreen: boolean; dist: number; big: boolean; tagged: boolean }[]) {
    const seen = new Set<string>();
    const W = window.innerWidth;
    const H = window.innerHeight;
    const pad = 46;
    for (const m of list) {
      seen.add(m.id);
      let me = this.markers.get(m.id);
      if (!me) {
        const root = el('div', 'marker');
        root.innerHTML = '<div class="marker-arrow"></div><div class="marker-diamond"><span>✦</span></div>';
        const dist = el('span', 'marker-dist');
        root.append(dist);
        this.markerLayer.append(root);
        me = { root, dist, last: '' };
        this.markers.set(m.id, me);
      }
      let x = m.x;
      let y = m.y;
      let angle = 0;
      if (!m.onScreen) {
        // clamp to screen edge along the direction from center
        const cx = W / 2;
        const cy = H / 2;
        const dx = x - cx;
        const dy = y - cy;
        const sx = (W / 2 - pad) / Math.max(Math.abs(dx), 1e-3);
        const sy = (H / 2 - pad) / Math.max(Math.abs(dy), 1e-3);
        const s = Math.min(sx, sy);
        x = cx + dx * s;
        y = cy + dy * s;
        angle = Math.atan2(dy, dx);
      }
      const cls = `marker${m.big ? ' big' : ''}${m.tagged ? ' tagged' : ''}${m.onScreen ? '' : ' off'}`;
      if (me.last !== cls) {
        me.root.className = cls;
        me.last = cls;
      }
      me.root.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      me.root.style.setProperty('--ang', `${angle}rad`);
      const d = `${Math.round(m.dist)}m`;
      if (me.dist.textContent !== d) me.dist.textContent = d;
    }
    for (const [id, me] of this.markers) {
      if (!seen.has(id)) {
        me.root.remove();
        this.markers.delete(id);
      }
    }
  }

  update(dt: number) {
    if (this.scoreShown !== this.scoreTarget) {
      const diff = this.scoreTarget - this.scoreShown;
      const step = Math.max(1, Math.abs(diff) * Math.min(1, dt * 8));
      this.scoreShown = diff > 0 ? Math.min(this.scoreTarget, this.scoreShown + step) : this.scoreTarget;
      const t = Math.round(this.scoreShown).toLocaleString();
      if (t !== this.scoreLastText) {
        this.scoreEl.textContent = t;
        this.scoreLastText = t;
      }
    }
  }
}
