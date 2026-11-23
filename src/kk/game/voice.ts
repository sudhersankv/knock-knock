// Push-to-talk speech recognition (Web Speech API, Chrome). Falls back to typing when unavailable.
type Rec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export class Voice {
  readonly supported: boolean;
  private rec: Rec | null = null;
  private finalText = '';
  private interim = '';
  private active = false;
  private onDone: ((text: string) => void) | null = null;
  onInterim: (text: string) => void = () => {};
  onFail: (why: string) => void = () => {};

  constructor() {
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    this.supported = !!Ctor;
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) this.finalText += res[0].transcript + ' ';
        else interim += res[0].transcript;
      }
      this.interim = interim;
      this.onInterim((this.finalText + interim).trim());
    };
    r.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') this.onFail(e.error);
    };
    r.onend = () => {
      if (this.onDone) {
        const text = (this.finalText + this.interim).trim();
        const cb = this.onDone;
        this.onDone = null;
        cb(text);
      }
      this.active = false;
    };
    this.rec = r;
  }

  get listening() {
    return this.active;
  }

  start() {
    if (!this.rec || this.active) return false;
    this.finalText = '';
    this.interim = '';
    this.active = true;
    try {
      this.rec.start();
    } catch {
      this.active = false;
      return false;
    }
    return true;
  }

  stop(): Promise<string> {
    return new Promise((resolve) => {
      if (!this.rec || !this.active) return resolve('');
      this.onDone = resolve;
      // give the recogniser a beat to flush the last words
      setTimeout(() => this.rec?.stop(), 250);
    });
  }
}
