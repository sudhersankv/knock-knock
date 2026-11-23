/*
  All sound is synthesized with Web Audio. No files to load.
  - SFX: ollie pop, landing thud, grind scrape loop, spray hiss loop, tag fanfare, boost whoosh, trick zip
  - Music: a lo-fi funk loop (kick/snare/hats + walking bass + stabby chords), sequenced live.
*/
export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private sprayGain: GainNode | null = null;
  private grindGain: GainNode | null = null;
  private grindFilter: BiquadFilterNode | null = null;
  private nextBeat = 0;
  private step = 0;
  private musicOn = true;

  /** Must be called from a user gesture (PLAY click). */
  start() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.32;
    this.music.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // persistent loops, gated by gain
    this.sprayGain = this.loopNoise('highpass', 3500, 0);
    const g = this.loopNoise('bandpass', 1800, 0);
    this.grindGain = g;
    this.nextBeat = ctx.currentTime + 0.1;
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.ctx) this.music.gain.setTargetAtTime(this.musicOn ? 0.32 : 0, this.ctx.currentTime, 0.2);
  }

  private loopNoise(type: BiquadFilterType, freq: number, gain: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = type === 'bandpass' ? 6 : 0.7;
    if (type === 'bandpass') this.grindFilter = f;
    const gn = ctx.createGain();
    gn.gain.value = gain;
    src.connect(f).connect(gn).connect(this.sfx);
    src.start();
    return gn;
  }

  private env(g: GainNode, t: number, a: number, peak: number, dcy: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode, slideTo?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.005, vol, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(t: number, dur: number, type: BiquadFilterType, freq: number, vol: number, dest: AudioNode, q = 1) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, 0.002, vol, dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  // ------------------------------------------------ sfx
  ollie() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst(t, 0.06, 'bandpass', 2500, 0.5, this.sfx, 3);
    this.tone(180, t, 0.12, 'triangle', 0.35, this.sfx, 90);
  }
  land(impact: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, impact / 14);
    this.tone(110, t, 0.18, 'sine', 0.3 + v * 0.5, this.sfx, 45);
    this.burst(t, 0.1, 'lowpass', 900, 0.25 + v * 0.3, this.sfx);
  }
  trick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(600, t, 0.18, 'square', 0.08, this.sfx, 1400);
    this.burst(t, 0.2, 'bandpass', 4000, 0.15, this.sfx, 2);
  }
  boost() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst(t, 0.45, 'bandpass', 900, 0.4, this.sfx, 1.5);
    this.tone(220, t, 0.4, 'sawtooth', 0.06, this.sfx, 660);
  }
  tag(big: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = big ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047];
    notes.forEach((n, i) => this.tone(n, t + i * 0.07, 0.35, 'square', 0.09, this.sfx));
    notes.forEach((n, i) => this.tone(n / 2, t + i * 0.07, 0.3, 'triangle', 0.12, this.sfx));
    this.burst(t, 0.5, 'highpass', 5000, 0.2, this.sfx);
  }
  /** Continuous loops: call every frame. */
  loops(spraying: boolean, grinding: boolean, speed: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sprayGain?.gain.setTargetAtTime(spraying ? 0.22 : 0, t, 0.03);
    this.grindGain?.gain.setTargetAtTime(grinding ? 0.28 : 0, t, 0.03);
    this.grindFilter?.frequency.setTargetAtTime(1200 + speed * 90, t, 0.05);
    this.scheduleMusic();
  }

  // ------------------------------------------------ music: 96 bpm funk, 16th-note sequencer
  private scheduleMusic() {
    const ctx = this.ctx!;
    const bpm = 96;
    const s16 = 60 / bpm / 4;
    // root progression: Dm7 - G7 - Cmaj7 - A7 (2 bars each... compressed to 1 bar each)
    const roots = [146.83, 196.0, 130.81, 110.0];
    const chordTones = [
      [293.7, 349.2, 440.0, 523.3],
      [293.7, 349.2, 392.0, 493.9],
      [261.6, 329.6, 392.0, 493.9],
      [277.2, 329.6, 392.0, 440.0],
    ];
    const kick = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0];
    const snare = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];
    const hat = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const bassPat = [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0];
    const bassOff = [0, 0, 0, 12, 0, 0, 7, 0, 0, 10, 0, 12, 0, 0, 7, 0];
    const stab = [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0];
    while (this.nextBeat < ctx.currentTime + 0.12) {
      const t = this.nextBeat;
      const i = this.step % 16;
      const bar = Math.floor(this.step / 16) % 4;
      const swing = i % 2 === 1 ? s16 * 0.12 : 0;
      const tt = t + swing;
      if (kick[i]) this.tone(120, tt, 0.22, 'sine', 0.9, this.music, 40);
      if (snare[i]) {
        this.burst(tt, 0.14, 'bandpass', 1800, 0.55, this.music, 0.8);
        this.tone(200, tt, 0.08, 'triangle', 0.2, this.music, 140);
      }
      if (hat[i]) this.burst(tt, i % 4 === 2 ? 0.08 : 0.025, 'highpass', 8000, i % 2 ? 0.08 : 0.14, this.music);
      if (bassPat[i]) {
        const f = roots[bar] * Math.pow(2, bassOff[i] / 12) * 0.5;
        this.tone(f, tt, s16 * 1.6, 'sawtooth', 0.22, this.bassFilter(), undefined);
      }
      if (stab[i]) for (const n of chordTones[bar]) this.tone(n, tt, 0.09, 'square', 0.035, this.music);
      this.nextBeat += s16;
      this.step++;
    }
  }

  private bf: BiquadFilterNode | null = null;
  private bassFilter() {
    if (!this.bf) {
      this.bf = this.ctx!.createBiquadFilter();
      this.bf.type = 'lowpass';
      this.bf.frequency.value = 600;
      this.bf.Q.value = 6;
      this.bf.connect(this.music);
    }
    return this.bf;
  }
}
