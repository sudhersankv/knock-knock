// In-game HUD (quest tracker, seals, courier, prompts) + world-space labels/markers + banners + esc menu.
import * as THREE from 'three';
import type { CompanionStatus, FeedItem, LockInfo } from '../../../shared/kk/protocol';
import { fmtTime, h, hex, ui, worldUi } from './dom';
import { portrait } from './icons';

const STATUS_TEXT: Record<CompanionStatus, string> = {
  following: 'At your side',
  listening: 'Listening',
  thinking: 'Choosing words',
  walking: 'Off to the keyhole',
  reading: 'Reading',
  chamber: 'In the chamber',
  returning: 'Coming back',
  delivering: 'Delivering',
  away: 'Away, with them',
  waiting_reply: 'Waiting for their reply',
};
const SEAL_NUM = ['I', 'II', 'III'];

function statusIcon(s: CompanionStatus) {
  if (s === 'thinking') return h('span', { class: 'st-ico' }, h('i'), h('i'), h('i'));
  if (s === 'chamber' || s === 'away' || s === 'waiting_reply') return h('span', { class: 'st-ico chamber' });
  if (s === 'walking' || s === 'returning' || s === 'reading') return h('span', { class: 'st-ico walk' });
  return h('span', { class: 'st-ico dot' });
}
/** Circular button-prompt glyph (hidden on touch devices). */
export const kc = (k: string, sm = false) => h('span', { class: `kc ${sm ? 'sm' : ''} ${k.length > 1 ? 'wide' : ''} key-only` }, k);
export const rule = () => h('div', { class: 'rule' }, h('i'), h('i'));
export const dia = (cls = '') => h('i', { class: `dia ${cls}` });

export class Hud {
  el: HTMLElement;
  private questEl = h('div', { class: 'quest' });
  private questIds = new Set<string>();
  private sealsEl = h('div', { class: 'seals' });
  private timerTxt = h('span', null, '8:00');
  private timerEl = h('div', { class: 'timer' }, dia(), this.timerTxt, dia());
  private partnerEl = h('div', { class: 'partner-line' });
  private medallion = h('div', { class: 'medallion' });
  private compName = h('span');
  private statusEl = h('div', { class: 'status' });
  private vocabEl = h('b', null, '0');
  private pipsEl = h('span', { class: 'pips', title: 'Words per trip' });
  private hint = '';
  private last = h('div', { class: 'last frame hidden' });
  private toastsEl = h('div', { class: 'toasts' });
  private bannerHost = h('div', { class: 'banner-host' });
  private pttEl = h('div', { class: 'ptt frame hidden' });
  private menuEl: HTMLElement | null = null;
  private budget = 5;
  private vocab = 0;
  endsAt = 0;
  onLastClick: () => void = () => {};

  constructor() {
    this.el = h(
      'div',
      { class: 'hud' },
      this.questEl,
      h('div', { class: 'hud-tr' }, this.timerEl, this.sealsEl, this.partnerEl),
      h(
        'div',
        { class: 'courier frame' },
        this.medallion,
        h('div', null, h('div', { class: 'nm' }, this.compName, h('small', null, 'your courier')), this.statusEl, h('div', { class: 'meters' }, h('span', null, this.vocabEl, ' words'), this.pipsEl)),
      ),
      h(
        'div',
        { class: 'prompts' },
        h('span', null, kc('C', true), 'Talk'),
        h('span', null, kc('↵', true), 'Type'),
        h('span', null, kc('E', true), 'Interact'),
        h('span', null, kc('R', true), 'Send to read'),
        h('span', null, kc('J', true), 'Journal'),
      ),
      this.last,
      this.toastsEl,
      this.pttEl,
    );
    this.last.onclick = () => this.onLastClick();
    ui().append(this.el, this.bannerHost);
    this.setLocks([]);
  }

  setIdentity(_codename: string, color: number, _difficulty: string) {
    this.el.style.setProperty('--me', hex(color));
    document.documentElement.style.setProperty('--me', hex(color));
    this.medallion.innerHTML = portrait(hex(color));
  }
  setPartnerColor(color: number) {
    this.el.style.setProperty('--them', hex(color));
    document.documentElement.style.setProperty('--them', hex(color));
  }
  setQuest(title: string, steps: { id: string; text: string; done: boolean }[], onSkip?: () => void) {
    this.questEl.innerHTML = '';
    this.questEl.classList.toggle('tut', !!onSkip);
    const ul = h('ul');
    for (const st of steps) {
      const fresh = !this.questIds.has(st.id);
      this.questIds.add(st.id);
      ul.append(h('li', { class: `${st.done ? 'done' : ''} ${fresh ? 'new' : ''}` }, dia(), h('span', null, st.text)));
    }
    this.questEl.append(h('div', { class: 'qt' }, title), ul);
    if (onSkip) {
      const skip = h('button', { class: 'linkish skip' }, 'Skip orientation');
      skip.onclick = onSkip;
      this.questEl.append(skip);
    }
  }
  /** Persistent card while you hold the other Arbiter's courier. */
  private visitEl: HTMLElement | null = null;
  visiting(v: { name: string; color: number; agendaHint: string; words: string[]; text: string } | null, on?: { reply: () => void; read: () => void; empty: () => void; canRead: boolean }) {
    this.visitEl?.remove();
    this.visitEl = null;
    if (!v || !on) return;
    const reply = h('button', { class: 'btn primary small' }, kc('↵', true), 'Reply');
    reply.onclick = on.reply;
    const read = h('button', { class: 'btn small', disabled: !on.canRead }, kc('R', true), 'Send to read');
    read.onclick = on.read;
    const empty = h('button', { class: 'linkish' }, 'Send back empty');
    empty.onclick = on.empty;
    this.visitEl = h(
      'div',
      { class: 'visiting frame solid', style: `--vc:${hex(v.color)}` },
      h('div', { class: 'vh' }, h('div', { class: 'medallion sm' }), h('div', null, h('div', { class: 'vn' }, v.name, h('small', null, 'their courier, waiting')), h('div', { class: 'va' }, v.agendaHint))),
      h('div', { class: 'vm' }, v.words.length ? v.words.join(' ') : '…'),
      v.text && v.text !== v.words.join(' ') ? h('div', { class: 'vs' }, v.text) : null,
      h('div', { class: 'vb' }, reply, read, empty),
    );
    (this.visitEl.querySelector('.medallion') as HTMLElement).innerHTML = portrait(hex(v.color));
    this.el.append(this.visitEl);
  }
  get holdingCard() {
    return !!this.visitEl;
  }
  setReadable(can: boolean) {
    const b = this.visitEl?.querySelectorAll('.vb .btn')[1] as HTMLButtonElement | undefined;
    if (b) b.disabled = !can;
  }
  setLocks(locks: LockInfo[]) {
    this.sealsEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const l = locks[i];
      this.sealsEl.append(h('div', { class: `seal ${l?.status ?? ''}`, title: l ? `${l.title}: ${l.status}` : '' }, h('span', null, SEAL_NUM[i])));
    }
    const partner = locks.find((l) => l.partnerStatus && l.status !== 'open')?.partnerStatus;
    this.partnerEl.innerHTML = '';
    if (partner) this.partnerEl.append(dia('them'), partner);
  }
  setCompanion(name: string, hint: string) {
    this.compName.textContent = name;
    this.hint = hint;
  }
  get agendaHint() {
    return this.hint;
  }
  setCompanionStatus(s: CompanionStatus, budget: number, vocab: number) {
    this.statusEl.innerHTML = '';
    this.statusEl.append(statusIcon(s), STATUS_TEXT[s] ?? s);
    this.setBudget(budget);
    this.setVocabCount(vocab);
  }
  setVocabCount(n: number) {
    const bump = n > this.vocab && this.vocab > 0;
    this.vocab = n;
    this.vocabEl.textContent = String(n);
    if (bump) {
      this.vocabEl.classList.remove('vocab-bump');
      void this.vocabEl.offsetWidth;
      this.vocabEl.classList.add('vocab-bump');
    }
  }
  setBudget(n: number) {
    const prev = this.budget;
    this.budget = n;
    this.pipsEl.innerHTML = '';
    const max = Math.max(5, n, prev);
    for (let i = 0; i < Math.min(7, max); i++) this.pipsEl.append(h('i', { class: `pip ${i < n ? 'on' : ''} ${i >= n && i < prev ? 'lost' : ''}` }));
  }
  setLast(from: string, words: string[], sub: string) {
    this.last.classList.remove('hidden');
    this.last.innerHTML = '';
    this.last.append(h('div', { class: 'from' }, dia('them'), from), h('div', { class: 'w' }, words.join(' ') || '…'), h('div', { class: 'sub' }, sub));
  }
  toast(text: string, _kind: '' | 'gold' | 'magic' = '', ms = 3200) {
    const t = h('div', { class: 'toast frame' }, text);
    this.toastsEl.append(t);
    while (this.toastsEl.children.length > 3) this.toastsEl.firstElementChild?.remove();
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 500);
  }
  /** Centered banner: engraved title with thin lines and diamonds ("Petition Settled"). */
  banner(title: string, why: string, kind: 'magic' | 'gold' = 'gold', _rune = '', ms = 4200) {
    this.bannerHost.innerHTML = '';
    const b = h('div', { class: `banner ${kind}` }, h('div', { class: 'ttl' }, title), rule(), why ? h('div', { class: 'why' }, why) : null);
    this.bannerHost.append(b);
    setTimeout(() => b.classList.add('out'), ms);
    setTimeout(() => b.remove(), ms + 600);
  }
  goal(text: string, sub: (Node | string)[]) {
    const g = h('div', { class: 'goal' }, h('div', { class: 'g1' }, text), rule(), h('div', { class: 'g2' }, ...sub));
    this.el.append(g);
    setTimeout(() => ((g.style.transition = 'opacity .8s'), (g.style.opacity = '0')), 4200);
    setTimeout(() => g.remove(), 5200);
  }
  addFeed(_it: FeedItem, _roundStart: number) {
    /* the decision log lives in the Journal (Log tab) */
  }
  toggleFeed(_force?: boolean) {}
  ptt(mode: 'off' | 'listen' | 'type', text = '', onSubmit?: (t: string) => void, placeholder = 'Tell your courier…') {
    this.pttEl.innerHTML = '';
    this.pttEl.classList.toggle('hidden', mode === 'off');
    if (mode === 'listen') this.pttEl.append(h('div', { class: 'mic' }), h('div', { class: 'txt' }, text || 'Listening. Tell your courier what to carry.'));
    if (mode === 'type') {
      const inp = h('input', { placeholder, maxLength: 300, enterKeyHint: 'send' }) as HTMLInputElement;
      const fire = () => {
        const v = inp.value.trim();
        this.ptt('off');
        if (v) onSubmit?.(v);
      };
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') fire();
        else if (e.key === 'Escape') this.ptt('off');
      });
      const send = h('button', { class: 'icon-btn', title: 'Send' }, '↵');
      send.onclick = fire;
      this.pttEl.append(h('div', { class: 'mic', style: 'background: var(--teal); animation:none' }), inp, send);
      setTimeout(() => inp.focus(), 0);
    }
  }
  /** Moderator struck banned words from what you told your courier. */
  struck(text: string, words: string[]) {
    const lower = new Set(words.map((w) => w.toLowerCase()));
    const line = h('div', { class: 'struck' });
    for (const tok of text.split(/(\s+)/)) {
      const bare = tok.toLowerCase().replace(/[^a-z']/g, '');
      line.append(lower.has(bare) ? h('s', null, tok) : document.createTextNode(tok));
    }
    const note = h('div', { class: 'mnote' }, h('i', { class: 'dia fill' }), `The Moderator struck ${words.map((w) => `'${w}'`).join(', ')}.`);
    const el = h('div', { class: 'toast frame struckbox' }, line, note);
    this.toastsEl.append(el);
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4700);
  }
  get typing() {
    return !this.pttEl.classList.contains('hidden') && !!this.pttEl.querySelector('input');
  }
  setRemaining(left: number) {
    this.timerTxt.textContent = fmtTime(left);
    this.timerEl.classList.toggle('low', left < 60);
  }
  menu(opts: { muted: boolean; onMute: (m: boolean) => void; onReport: () => void; onLeave: () => void }) {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
      return;
    }
    const close = () => (this.menuEl?.remove(), (this.menuEl = null));
    const mute = h('button', { class: 'btn wide' }, opts.muted ? 'Unmute' : 'Mute');
    mute.onclick = () => (opts.onMute(!opts.muted), close());
    const rep = h('button', { class: 'btn wide' }, 'Report');
    rep.onclick = () => (opts.onReport(), close());
    const leave = h('button', { class: 'btn danger wide' }, 'Leave the Commons');
    leave.onclick = () => (opts.onLeave(), close());
    const resume = h('button', { class: 'btn primary wide' }, 'Resume');
    resume.onclick = close;
    this.menuEl = h(
      'div',
      { class: 'modal-wrap', onclick: (e: Event) => e.target === this.menuEl && close() },
      h('div', { class: 'frame solid', style: 'padding:26px 30px; display:flex; flex-direction:column; gap:12px; min-width:300px; border-radius:14px' }, h('div', { class: 'h2', style: 'font-size:26px' }, 'Paused'), rule(), resume, mute, rep, leave),
    );
    ui().append(this.menuEl);
  }
  get menuOpen() {
    return !!this.menuEl;
  }
  destroy() {
    this.menuEl?.remove();
    this.bannerHost.remove();
    this.el.remove();
  }
}

// ---------- world-space overlay (nameplates, bubbles, tooltips, pops) ----------
interface Tag {
  el: HTMLElement;
  prio: number;
  sx?: number;
  sy?: number;
  get: () => THREE.Vector3 | null;
  until: number; // performance.now ms, 0 = forever
  yOff: number;
  /** Objective markers get an edge-of-screen arrow while offscreen. */
  edge?: HTMLElement;
}
const tmp = new THREE.Vector3();

export class WorldLabels {
  private tags = new Map<string, Tag>();
  private root = worldUi();
  /** Smooth label motion (off for screenshots). */
  smooth = true;
  constructor(private camera: THREE.Camera) {}

  set(key: string, el: HTMLElement, get: () => THREE.Vector3 | null, yOff: number, ms = 0) {
    this.remove(key, true);
    el.classList.add('wl');
    this.root.append(el);
    const prio = key.startsWith('bubble:') ? 3 : key === 'tip' || key.startsWith('ring:') || key.startsWith('tipcard:') ? 2 : key.startsWith('np:') || key === 'self' || key.startsWith('mk:') ? 1 : 0;
    this.tags.set(key, { el, get, until: ms ? performance.now() + ms : 0, yOff, prio });
  }
  has(key: string) {
    return this.tags.has(key);
  }
  remove(key: string, instant = false) {
    const t = this.tags.get(key);
    if (!t) return;
    this.tags.delete(key);
    t.edge?.remove();
    if (instant) t.el.remove();
    else {
      t.el.classList.add('leaving');
      setTimeout(() => t.el.remove(), 260);
    }
  }
  clear() {
    for (const k of [...this.tags.keys()]) this.remove(k, true);
  }
  bubble(key: string, words: string[] | string, get: () => THREE.Vector3 | null, kind: 'delivery' | 'line' | 'thinking' = 'line', ms = 5200, yOff = 2.4, who?: { name: string; color: number }) {
    const el = h('div', { class: `bubble ${kind}` });
    if (kind === 'thinking') el.append(h('i', { class: 'dot' }), h('i', { class: 'dot' }), h('i', { class: 'dot' }));
    else {
      if (who) el.append(h('span', { class: 'who', style: `background:${hex(who.color)}` }, who.name.slice(0, 1).toUpperCase()));
      const ws = h('span', { class: 'ws' });
      const list = Array.isArray(words) ? words : [words];
      list.forEach((w, i) => ws.append(h('span', { class: 'w', style: kind === 'delivery' ? `animation-delay:${0.25 + i * 0.22}s` : '' }, w)));
      el.append(ws);
    }
    this.set(`bubble:${key}`, el, get, yOff, ms);
  }
  /** Objective marker: a glowing diamond above a world target, with an edge arrow when offscreen. */
  marker(key: string, label: string, get: () => THREE.Vector3 | null, yOff = 3.2) {
    if (this.tags.has(`mk:${key}`)) return;
    this.set(`mk:${key}`, h('div', { class: 'marker' }, h('i'), label ? h('small', null, label) : null), get, yOff);
    const t = this.tags.get(`mk:${key}`)!;
    t.edge = h('div', { class: 'edge-arrow hidden' });
    this.root.append(t.edge);
  }
  clearMarkers(except: Set<string> = new Set()) {
    for (const k of [...this.tags.keys()]) if (k.startsWith('mk:') && !except.has(k.slice(3))) this.remove(k, true);
  }
  pop(text: string, at: THREE.Vector3) {
    const p = at.clone();
    this.set(`pop:${Math.random()}`, h('div', { class: 'chip-pop' }, text), () => p, 2.2, 1600);
  }
  ring(key: string, seconds: number, get: () => THREE.Vector3 | null, yOff = 1.6) {
    const el = h('div', { class: 'ring-wrap', style: `--dur:${seconds}s` });
    el.innerHTML = `<svg viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="18"/><circle class="fg" cx="22" cy="22" r="18"/></svg>`;
    this.set(`ring:${key}`, el, get, yOff, seconds * 1000 + 300);
  }
  update(w: number, hgt: number) {
    const now = performance.now();
    const vis: { t: Tag; x: number; y: number; w: number; h: number }[] = [];
    for (const [k, t] of this.tags) {
      if (t.until && now > t.until) {
        this.remove(k);
        continue;
      }
      const p = t.get();
      if (!p) {
        t.el.style.display = 'none';
        continue;
      }
      tmp.copy(p);
      tmp.y += t.yOff;
      tmp.project(this.camera);
      const off = tmp.z > 1 || Math.abs(tmp.x) > 1 || Math.abs(tmp.y) > 1;
      if (t.edge) {
        t.edge.classList.toggle('hidden', !off);
        if (off) {
          let dx = tmp.x, dy = -tmp.y;
          if (tmp.z > 1) { dx = -dx; dy = -dy; }
          const a = Math.atan2(dy, dx);
          const m = 36;
          const k = Math.min((w / 2 - m) / Math.max(1e-3, Math.abs(Math.cos(a))), (hgt / 2 - m) / Math.max(1e-3, Math.abs(Math.sin(a))));
          t.edge.style.transform = `translate(${w / 2 + Math.cos(a) * k - 11}px, ${hgt / 2 + Math.sin(a) * k - 11}px) rotate(${a + Math.PI / 4}rad)`;
          t.edge.style.left = '0'; t.edge.style.top = '0';
        }
      }
      if (off && (tmp.z > 1 || Math.abs(tmp.x) > 1.2 || Math.abs(tmp.y) > 1.2 || t.edge)) {
        t.el.style.display = 'none';
        continue;
      }
      t.el.style.display = '';
      vis.push({ t, x: ((tmp.x + 1) / 2) * w, y: ((1 - tmp.y) / 2) * hgt, w: t.el.offsetWidth, h: t.el.offsetHeight });
    }
    // HUD panels (screen rects) that world labels must not draw over
    const hudRects = [...document.querySelectorAll('.quest, .hud-tr, .courier, .last:not(.hidden), .banner-host .banner, .ptt:not(.hidden), .stick, .tbtns, .tbtn.jr, .dlg')].map((e) => e.getBoundingClientRect());
    // screen-space de-overlap: high priority keeps its spot; others get pushed up above whatever they hit
    vis.sort((a, b) => b.t.prio - a.t.prio || b.y - a.y);
    const placed: typeof vis = [];
    for (const v of vis) {
      for (let pass = 0; pass < 4; pass++) {
        let moved = false;
        for (const o of placed) {
          const ox = Math.abs(v.x - o.x) < (v.w + o.w) / 2 + 4;
          const oy = v.y - v.h < o.y && v.y > o.y - o.h;
          if (ox && oy) {
            v.y = o.y - o.h - 4;
            moved = true;
          }
        }
        if (!moved) break;
      }
      placed.push(v);
      const t = v.t;
      t.sx = !this.smooth || t.sx == null || Math.abs(t.sx - v.x) > 60 ? v.x : t.sx + (v.x - t.sx) * 0.5;
      t.sy = !this.smooth || t.sy == null || Math.abs(t.sy - v.y) > 60 ? v.y : t.sy + (v.y - t.sy) * 0.35;
      // clamp inside a safe margin, then hide if it would sit on a HUD panel
      const M = 12;
      const cx = Math.min(w - M - v.w / 2, Math.max(M + v.w / 2, t.sx!));
      const cy = Math.min(hgt - M, Math.max(M + v.h, t.sy!));
      const l = cx - v.w / 2;
      const top = cy - v.h;
      const under = hudRects.some((r) => l < r.right && l + v.w > r.left && top < r.bottom && cy > r.top);
      t.el.classList.toggle('under-hud', under);
      t.el.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -100%)`;
    }
  }
}

export function nameplate(name: string, color: number) {
  return h('div', { class: 'nameplate' }, h('i', { style: `background:${hex(color)}` }), name);
}
