// Push-to-talk: record the mic while C / the mic button is held, then transcribe on our server (Deepgram).
// Works in every modern browser (Chrome, Safari, Firefox, iOS, Android). Falls back to typing when the mic is unavailable.

export class Voice {
  readonly supported: boolean;
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private active = false;
  private startedAt = 0;
  onInterim: (text: string) => void = () => {};
  onFail: (why: string) => void = () => {};

  constructor() {
    this.supported = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  get listening() {
    return this.active;
  }

  private pickType(): string {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (const t of types) if (MediaRecorder.isTypeSupported?.(t)) return t;
    return '';
  }

  start() {
    if (!this.supported || this.active) return false;
    this.active = true;
    this.chunks = [];
    this.startedAt = performance.now();
    this.onInterim('Listening…');
    const begin = (s: MediaStream) => {
      if (!this.active) return; // released before the mic opened
      const type = this.pickType();
      try {
        this.rec = type ? new MediaRecorder(s, { mimeType: type }) : new MediaRecorder(s);
      } catch {
        this.active = false;
        this.onFail('recorder');
        return;
      }
      this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
      this.rec.start(250);
    };
    if (this.stream && this.stream.getAudioTracks().some((t) => t.readyState === 'live')) begin(this.stream);
    else
      navigator.mediaDevices
        .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        .then((s) => {
          this.stream = s;
          begin(s);
        })
        .catch(() => {
          this.active = false;
          this.onFail('not-allowed');
        });
    return true;
  }

  stop(): Promise<string> {
    return new Promise((resolve) => {
      if (!this.active) return resolve('');
      this.active = false;
      const rec = this.rec;
      this.rec = null;
      if (!rec || rec.state === 'inactive' || performance.now() - this.startedAt < 300) {
        rec?.state !== 'inactive' && rec?.stop();
        return resolve('');
      }
      rec.onstop = async () => {
        const blob = new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' });
        this.chunks = [];
        if (blob.size < 1200) return resolve('');
        this.onInterim('Transcribing…');
        try {
          const r = await fetch('/stt', { method: 'POST', headers: { 'Content-Type': blob.type.split(';')[0] || 'audio/webm' }, body: blob });
          const j = (await r.json().catch(() => ({}))) as { text?: string };
          if (!r.ok) this.onFail('stt');
          resolve((j.text ?? '').trim());
        } catch {
          this.onFail('network');
          resolve('');
        }
      };
      // small tail so the last word isn't clipped
      setTimeout(() => rec.state !== 'inactive' && rec.stop(), 200);
    });
  }
}
