// Touch controls: left virtual joystick, contextual action button, hold-to-talk mic, keyboard, journal; pinch zoom.
import { h, ui } from '../ui/dom';

export const isTouch = new URLSearchParams(location.search).has('touch') || matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const MIC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/></svg>`;
const KEYS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h1M11 10h1M15 10h1M8 14h8"/></svg>`;
const BOOK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 5c3-1 6-1 8 1v14c-2-2-5-2-8-1zM20 5c-3-1-6-1-8 1v14c2-2 5-2 8-1z"/></svg>`;
const READ = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;

export interface TouchHandlers {
  action: () => void;
  sendRead: () => void;
  micDown: () => void;
  micUp: () => void;
  keyboard: () => void;
  journal: () => void;
  zoom: (delta: number) => void;
}

export class TouchControls {
  axis: [number, number] = [0, 0];
  private root: HTMLElement;
  private nub: HTMLElement;
  private act: HTMLButtonElement;
  private readBtn: HTMLButtonElement;
  private stickId: number | null = null;
  private center = { x: 0, y: 0 };

  constructor(private on: TouchHandlers) {
    document.documentElement.classList.add('touch');
    this.nub = h('div', { class: 'nub' });
    const stick = h('div', { class: 'stick' }, this.nub);
    this.act = h('button', { class: 'tbtn big', disabled: true }, 'Use') as HTMLButtonElement;
    this.readBtn = h('button', { class: 'tbtn hidden', title: 'Send courier to read' }) as HTMLButtonElement;
    this.readBtn.innerHTML = READ;
    const mic = h('button', { class: 'tbtn', title: 'Hold to talk to your courier' }) as HTMLButtonElement;
    mic.innerHTML = MIC;
    const kb = h('button', { class: 'tbtn', title: 'Type to your courier' }) as HTMLButtonElement;
    kb.innerHTML = KEYS;
    const jr = h('button', { class: 'tbtn jr', title: 'Journal' }) as HTMLButtonElement;
    jr.innerHTML = BOOK;
    this.root = h('div', { class: 'touchui hidden' }, stick, h('div', { class: 'tbtns' }, this.readBtn, this.act, mic, kb), jr);
    ui().append(this.root);

    const R = 52;
    stick.addEventListener('pointerdown', (e) => {
      this.stickId = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      const r = stick.getBoundingClientRect();
      this.center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this.moveStick(e.clientX, e.clientY, R);
    });
    stick.addEventListener('pointermove', (e) => e.pointerId === this.stickId && this.moveStick(e.clientX, e.clientY, R));
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.axis = [0, 0];
      this.nub.style.transform = '';
    };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    this.act.addEventListener('click', () => on.action());
    this.readBtn.addEventListener('click', () => on.sendRead());
    kb.addEventListener('click', () => on.keyboard());
    jr.addEventListener('click', () => on.journal());
    mic.addEventListener('pointerdown', (e) => {
      mic.setPointerCapture(e.pointerId);
      mic.classList.add('held');
      on.micDown();
    });
    const micEnd = () => {
      if (!mic.classList.contains('held')) return;
      mic.classList.remove('held');
      on.micUp();
    };
    mic.addEventListener('pointerup', micEnd);
    mic.addEventListener('pointercancel', micEnd);

    // pinch zoom on the canvas
    const pts = new Map<number, { x: number; y: number }>();
    let lastD = 0;
    const canvas = document.getElementById('game')!;
    canvas.addEventListener('pointerdown', (e) => pts.set(e.pointerId, { x: e.clientX, y: e.clientY }));
    canvas.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastD) on.zoom((lastD - d) * 0.05);
        lastD = d;
      }
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) lastD = 0;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }
  private moveStick(x: number, y: number, R: number) {
    let dx = x - this.center.x;
    let dy = y - this.center.y;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    this.nub.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.min(1, d / R);
    this.axis = d > 6 ? [(dx / Math.max(d, 1e-3)) * m, (dy / Math.max(d, 1e-3)) * m] : [0, 0];
  }
  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
  }
  setAction(label: string | null, canSendRead: boolean) {
    this.act.disabled = !label;
    this.act.textContent = label ?? 'Use';
    this.readBtn.classList.toggle('hidden', !canSendRead);
  }
}

/** Gentle "rotate your phone" hint for portrait phones (dismissable). */
export function rotateHint() {
  if (!isTouch) return;
  const el = h('div', { class: 'rotate-hint' }, h('div', { class: 'rh' }, h('div', { class: 'phone' }), 'Turn your phone sideways', h('small', null, 'The Commons is wider than it is tall.'), h('button', { class: 'btn small' }, 'Play anyway')));
  el.querySelector('button')!.addEventListener('click', () => el.classList.add('dismissed'));
  ui().append(el);
}
