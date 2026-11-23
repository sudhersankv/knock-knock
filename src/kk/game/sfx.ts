// Tiny synthesized one-shots (all < 1 s) + a quiet ambient bed.
export class Sfx {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  muted = false;

  start() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    this.ambient();
  }
  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  private env(t0: number, a: number, d: number, peak: number) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    g.connect(this.master);
    return g;
  }
  private noise(dur: number) {
    const c = this.ctx!;
    const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource();
    s.buffer = b;
    return s;
  }

  knock(at = 0) {
    if (!this.ctx) return;
    const c = this.ctx;
    for (const off of [0, 0.22]) {
      const t = c.currentTime + at + off;
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
      const g = this.env(t, 0.003, 0.16, 0.9);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.2);
      const n = this.noise(0.06);
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      const g2 = this.env(t, 0.002, 0.05, 0.4);
      n.connect(f).connect(g2);
      n.start(t);
    }
  }
  step() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const n = this.noise(0.05);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500 + Math.random() * 200;
    n.connect(f).connect(this.env(t, 0.002, 0.05, 0.05));
    n.start(t);
  }
  chirp(pitch = 1) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(700 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(1500 * pitch, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(1100 * pitch, t + 0.16);
    o.connect(this.env(t, 0.005, 0.18, 0.25));
    o.start(t);
    o.stop(t + 0.25);
  }
  pop() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(500, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.06);
    o.connect(this.env(t, 0.004, 0.1, 0.2));
    o.start(t);
    o.stop(t + 0.15);
  }
  grind() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const n = this.noise(0.8);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.linearRampToValueAtTime(120, t + 0.7);
    n.connect(f).connect(this.env(t, 0.05, 0.7, 0.5));
    n.start(t);
  }
  unlock() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    this.grind();
    [196, 294, 392, 494].forEach((fr, i) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = fr;
      o.connect(this.env(t + 0.25 + i * 0.07, 0.01, 0.6, 0.18));
      o.start(t + 0.25 + i * 0.07);
      o.stop(t + 1);
    });
  }
  chime() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    [880, 1318].forEach((fr, i) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = fr;
      o.connect(this.env(t + i * 0.12, 0.005, 0.5, 0.15));
      o.start(t + i * 0.12);
      o.stop(t + 0.8);
    });
  }
  tick() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const n = this.noise(0.03);
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2500;
    n.connect(f).connect(this.env(t, 0.001, 0.03, 0.35));
    n.start(t);
  }
  error() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(180, t);
    o.frequency.linearRampToValueAtTime(120, t + 0.2);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 800;
    o.connect(f).connect(this.env(t, 0.005, 0.22, 0.12));
    o.start(t);
    o.stop(t + 0.3);
  }
  private ambient() {
    const c = this.ctx!;
    const n = this.noise(4);
    n.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 400;
    f.Q.value = 0.4;
    const g = c.createGain();
    g.gain.value = 0.025;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = c.createGain();
    lg.gain.value = 0.015;
    lfo.connect(lg).connect(g.gain);
    n.connect(f).connect(g).connect(this.master);
    n.start();
    lfo.start();
    // distant bells
    const bell = () => {
      if (!this.ctx) return;
      const t = c.currentTime;
      const base = [523, 587, 659, 784][Math.floor(Math.random() * 4)];
      for (const m of [1, 2.76]) {
        const o = c.createOscillator();
        o.frequency.value = base * m;
        o.connect(this.env(t, 0.01, 2.5, 0.012 / m));
        o.start(t);
        o.stop(t + 2.6);
      }
      setTimeout(bell, 7000 + Math.random() * 9000);
    };
    setTimeout(bell, 4000);
  }
}

// ---- TTS for agent lines (browser speechSynthesis fallback; distinct voice per speaker) ----
const voiceCache = new Map<string, { voice: SpeechSynthesisVoice | null; pitch: number; rate: number }>();
export function speak(speakerKey: string, text: string, muted: boolean) {
  if (muted || !('speechSynthesis' in window) || !text) return;
  let v = voiceCache.get(speakerKey);
  if (!v) {
    const voices = speechSynthesis.getVoices().filter((x) => x.lang.startsWith('en'));
    let h = 0;
    for (const ch of speakerKey) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const gate = speakerKey.toLowerCase().includes('gate');
    v = { voice: voices.length ? voices[h % voices.length] : null, pitch: gate ? 0.6 : 1.1 + (h % 5) * 0.12, rate: gate ? 0.85 : 1.05 + (h % 3) * 0.05 };
    voiceCache.set(speakerKey, v);
  }
  const u = new SpeechSynthesisUtterance(text);
  if (v.voice) u.voice = v.voice;
  u.pitch = v.pitch;
  u.rate = v.rate;
  u.volume = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
