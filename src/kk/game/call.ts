// 1:1 WebRTC voice call after the door opens. Signalling rides the room socket ('rtc' messages).
import type { Net } from './net';

export type CallState = 'connecting' | 'connected' | 'failed' | 'ended';

export class Call {
  private pc: RTCPeerConnection | null = null;
  private local: MediaStream | null = null;
  private dc: RTCDataChannel | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private localAn: AnalyserNode | null = null;
  private remoteAn: AnalyserNode | null = null;
  private failTimer = 0;
  private pendingIce: RTCIceCandidateInit[] = [];
  state: CallState = 'ended';
  muted = false;
  onState: (s: CallState) => void = () => {};
  onText: (text: string) => void = () => {};

  constructor(private net: Net) {}

  async start(offerer: boolean) {
    this.end();
    this.state = 'connecting';
    this.onState('connecting');
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] });
    this.pc = pc;
    pc.onicecandidate = (e) => e.candidate && this.net.send({ t: 'rtc', data: { ice: e.candidate.toJSON() } });
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      if (!this.audioEl) {
        this.audioEl = new Audio();
        this.audioEl.autoplay = true;
      }
      this.audioEl.srcObject = stream;
      void this.audioEl.play().catch(() => {});
      this.remoteAn = this.analyse(stream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') this.setState('connected');
      if (pc.connectionState === 'failed') this.setState('failed');
    };
    pc.ondatachannel = (e) => this.bindDc(e.channel);
    if (offerer) this.bindDc(pc.createDataChannel('chat'));

    try {
      this.local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      for (const tr of this.local.getTracks()) pc.addTrack(tr, this.local);
      this.localAn = this.analyse(this.local);
    } catch {
      // no mic: still join to listen + text chat
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }
    if (offerer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.net.send({ t: 'rtc', data: { sdp: pc.localDescription } });
    }
    this.failTimer = window.setTimeout(() => {
      if (this.state === 'connecting') this.setState('failed');
    }, 10000);
  }

  async signal(data: unknown) {
    const pc = this.pc;
    if (!pc) return;
    const d = data as { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit };
    if (d.sdp) {
      await pc.setRemoteDescription(d.sdp);
      for (const c of this.pendingIce) await pc.addIceCandidate(c).catch(() => {});
      this.pendingIce = [];
      if (d.sdp.type === 'offer') {
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        this.net.send({ t: 'rtc', data: { sdp: pc.localDescription } });
      }
    } else if (d.ice) {
      if (pc.remoteDescription) await pc.addIceCandidate(d.ice).catch(() => {});
      else this.pendingIce.push(d.ice);
    }
  }

  sendText(text: string) {
    if (this.dc && this.dc.readyState === 'open') {
      this.dc.send(text);
      return true;
    }
    return false;
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.local?.getAudioTracks().forEach((t) => (t.enabled = !m));
  }

  /** 0..1 speaking levels. */
  levels(): { me: number; them: number } {
    return { me: this.muted ? 0 : level(this.localAn), them: level(this.remoteAn) };
  }

  end() {
    clearTimeout(this.failTimer);
    this.dc?.close();
    this.pc?.close();
    this.local?.getTracks().forEach((t) => t.stop());
    if (this.audioEl) this.audioEl.srcObject = null;
    this.pc = null;
    this.dc = null;
    this.local = null;
    this.localAn = this.remoteAn = null;
    this.pendingIce = [];
    if (this.state !== 'ended') {
      this.state = 'ended';
      this.onState('ended');
    }
  }

  private setState(s: CallState) {
    if (this.state === s) return;
    this.state = s;
    if (s !== 'connecting') clearTimeout(this.failTimer);
    this.onState(s);
  }
  private bindDc(dc: RTCDataChannel) {
    this.dc = dc;
    dc.onmessage = (e) => this.onText(String(e.data));
  }
  private analyse(stream: MediaStream) {
    try {
      this.ctx ??= new AudioContext();
      const src = this.ctx.createMediaStreamSource(stream);
      const an = this.ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      return an;
    } catch {
      return null;
    }
  }
}

const buf = new Uint8Array(512);
function level(an: AnalyserNode | null) {
  if (!an) return 0;
  an.getByteTimeDomainData(buf);
  let s = 0;
  for (let i = 0; i < an.fftSize; i++) {
    const v = (buf[i] - 128) / 128;
    s += v * v;
  }
  return Math.min(1, Math.sqrt(s / an.fftSize) * 6);
}
