// KNOCK KNOCK — client entry. Flow: landing → onboarding → queue → drop-in → play → unlock/call → reveal → next.
import * as THREE from 'three';
import { createStage, buildWorld, rigs, createFx, loadArt, setQuality } from './game/art';
import { Net } from './game/net';
import { MockServer, mockReveal, MOCK_RESONANCE } from './game/mock';
import { Actors, hash } from './game/actors';
import { FollowCam } from './game/camera';
import { Keys, clampSide, resolve, isTyping, PLAYER_RADIUS, HUMAN_SPEED } from './game/motion';
import { Sfx, speak } from './game/sfx';
import { Voice } from './game/voice';
import { Call } from './game/call';
import { Hud, WorldLabels, nameplate, kc } from './ui/hud';
import { showLanding, showOnboarding, QueueScreen, showHowTo, newMatchCode } from './ui/screens';
let practiceMode = false;
import { showReader, showTerminal, closeModal, modalOpen, modalKind, showRecord, type RecordData } from './ui/modals';
import { CallUi, showReveal, settledLine, readLine, type Debate, type Resonance } from './ui/endgame';
import { showDialogue, dialogueAdvance, dialogueOpen, showItemGet, tipOnce, tipCard, showScoutWord, showAiReveal, whoTip } from './ui/dialogue';
import { Journal } from './ui/journal';
import { Tutorial, tutorialDone } from './game/tutorial';
import { TouchControls, isTouch, rotateHint } from './game/touch';
import { h } from './ui/dom';
import type { Anim, LockId, LockInfo, ObjInfo, S2C, QuestStep } from '../../shared/kk/protocol';
import { at, INTERACT_RADIUS, type Side } from '../../shared/kk/layout';
import { STATE_HZ } from '../../shared/kk/protocol';

const params = new URLSearchParams(location.search);
const MOCK = params.has('mock');
const SHOT = params.get('shot');
if (SHOT) document.documentElement.classList.add('shot');

// ---------- engine ----------
const canvas = document.getElementById('game') as HTMLCanvasElement;
const stage = createStage(canvas);
// phones/tablets default to low quality (no AO, pixel ratio 1)
if (isTouch && !params.has('q')) setQuality('low');
try {
  await loadArt();
} catch (e) {
  console.warn('loadArt failed, using fallback rigs', e);
}
const world = buildWorld(stage);
const fx = createFx(stage.scene);
const actors = new Actors(stage.scene, rigs);
const cam = new FollowCam(stage.camera, canvas);
const labels = new WorldLabels(stage.camera);
labels.smooth = !SHOT;
const keys = new Keys();
const sfx = new Sfx();
const voice = new Voice();
const net = new Net();
const call = new Call(net);
let mock: MockServer | null = null;
const journal = new Journal();
const touch = isTouch ? new TouchControls({
  action: () => (dialogueOpen() ? dialogueAdvance() : holding ? openReply() : !nearest && scoutNear() ? giveScout() : interact(nearest)),
  sendRead: () => { const t = nearestThread(); if (t) sendRead(t.id); },
  micDown: () => startTalk(),
  micUp: () => void stopTalk(),
  keyboard: () => typeToCourier(),
  journal: () => journal.toggle(),
  zoom: (d) => cam.zoomBy(d),
}) : null;
if (isTouch) rotateHint();

const resize = () => {
  stage.resize(innerWidth, innerHeight);
  cam.fitAspect(innerWidth / innerHeight);
};
addEventListener('resize', resize);
resize();

// ---------- game state ----------
interface Round {
  side: Side;
  codename: string;
  color: number;
  partner: { codename: string; color: number };
  companionId: string;
  companionName: string;
  objects: ObjInfo[];
  locks: LockInfo[];
  budget: number;
  vocab: string[];
  startedAt: number;
  unlocked: boolean;
  callUi: CallUi | null;
  lastDelivery: { words: string[]; text: string } | null;
  foundScraps: Set<string>;
  quest: QuestStep[];
  debate: Debate | null;
  resonance: Resonance | null;
  deliveries: number;
  practice: boolean;
}
let selfId = '';
let codename = '';
let round: Round | null = null;
let hud: Hud | null = null;
let queue: QueueScreen | null = null;
let welcome: Extract<S2C, { t: 'welcome' }> | null = null;
let muted = false;
let attract = true;
/** Set when the fps probe finished after the player already progressed; applied while queueing. */
let lowQualityWanted = false;

const me = {
  rig: null as ReturnType<typeof rigs.human> | null,
  pos: new THREE.Vector3(),
  ry: 0,
  speed: 0,
  anim: 'idle' as Anim,
  dropT: -1,
  stepAcc: 0,
};
let doorT = 0;
let doorTarget = 0;
let pullBackUntil = 0;
let nearest: ObjInfo | null = null;
let prevNear: ObjInfo | null = null;
let openObjectId: string | null = null;
let lastBudget: number | null = null;
let glintAcc = 0;
const isHiddenScrap = (o: ObjInfo) => o.kind === 'scrap' && !round?.foundScraps.has(o.id);
const addObjLabel = (o: ObjInfo) => {
  if (isHiddenScrap(o)) return;
  labels.set(`obj:${o.id}`, h('div', { class: 'objlabel' }, o.label), () => new THREE.Vector3(o.pos[0], 0, o.pos[1]), 2.6);
};
const v3 = (id: string) => {
  const o = round?.objects.find((x) => x.id === id);
  return o ? new THREE.Vector3(o.pos[0], 0, o.pos[1]) : null;
};
let sendAcc = 0;
let pttDown = false;

// ---------- boot ----------
async function boot() {
  if (MOCK) mock = new MockServer(net);
  else {
    try {
      await net.connect();
    } catch {
      /* toast below */
    }
  }
  net.on('welcome', (m) => {
    welcome = m;
    selfId = m.id;
    codename = m.codename;
    actors.selfId = m.id;
  });
  wireNet();
  if (SHOT === 'reveal') {
    await waitWelcome();
    attract = false;
    showReveal(mockReveal(), 'A', { A: 'Quiet Heron', B: 'Velvet Otter' }, { next: () => {}, stay: () => {} }, { question: 'Should an agent be allowed to delete its own memories?', you: 3, them: -2, agents: 214 }, MOCK_RESONANCE);
    return;
  }
  const landing = showLanding();
  if (SHOT === 'landing') return;
  if (SHOT === 'howto') {
    showHowTo();
    return void setTimeout(() => (document.querySelectorAll('.ht-tab')[1] as HTMLElement | undefined)?.click(), 50);
  }
  const lr = SHOT ? { demo: false } : await landing;
  if (SHOT) document.querySelector('.screen')?.remove();
  sfx.start();
  sfx.knock();
  await waitWelcome();
  if (!welcome) return;
  const ob = showOnboarding(welcome.debates, welcome.interests);
  if (SHOT === 'onboarding') return;
  let answers: Awaited<typeof ob>;
  if (SHOT) {
    document.querySelector('.screen')?.remove();
    answers = { takes: {}, interests: welcome.interests.slice(0, 3) };
  } else answers = await ob;
  queue = new QueueScreen(codename);
  practiceMode = !!(lr as { practice?: boolean }).practice;
  const matchCode = practiceMode ? `PRACTICE-${newMatchCode()}` : (lr as { matchCode?: string }).matchCode;
  net.send({ t: 'hello', codename, takes: answers.takes, interests: answers.interests, matchCode, demo: (lr as { demo: boolean }).demo || params.has('demo') });
}

function waitWelcome() {
  return new Promise<void>((r) => {
    if (welcome) return r();
    const iv = setInterval(() => {
      if (welcome) {
        clearInterval(iv);
        r();
      }
    }, 50);
    setTimeout(() => {
      if (!welcome) {
        clearInterval(iv);
        toastScreen('Can’t reach the server. Refresh to retry.');
        r();
      }
    }, 6000);
  });
}

function toastScreen(text: string, ms = 4000) {
  const el = h('div', { class: 'toasts', style: 'position:fixed; z-index:20' }, h('div', { class: 'toast' }, text));
  document.getElementById('ui')!.append(el);
  setTimeout(() => el.remove(), ms);
}

// ---------- network handlers ----------
function wireNet() {
  net.on('queued', (m) => queue?.setInfo(m.code ? `Code ${m.code}. Waiting for them…` : 'Knocking on doors…'));
  net.on('matched', async (m) => {
    const q = queue;
    queue = null;
    if (q) await q.matched(m.partner.codename);
    startRound(m);
  });
  net.on('state', (m) => {
    actors.ingest(performance.now() / 1000, m.actors);
    hud?.setRemaining(m.time);
  });
  net.on('object', (m) => {
    openObjectId = m.content.id;
    if (m.content.kind === 'terminal') return openTerminal();
    if (m.content.kind === 'scrap') return void gotScrap(m.content);
    if (m.content.kind === 'thread') tut.event('read_thread');
    if (m.content.kind === 'codex') tut.event('read_codex');
    showReader(m.content, { canSend: m.content.kind === 'thread', companion: round?.companionName ?? 'your courier', onSend: () => sendRead(m.content.id) });
  });
  net.on('vocab', (m) => {
    if (!round) return;
    round.vocab = m.words;
    hud?.setVocabCount(m.words.length);
    journal.words = m.words;
    m.added.forEach((w) => journal.newWords.add(w));
    journal.refresh();
    if (m.added.length) {
      const c = actors.map.get(round.companionId);
      labels.pop(`+${m.added.length} words`, (c?.pos ?? me.pos).clone());
      sfx.pop();
    }
  });
  net.on('companion', (m) => {
    if (!round) return;
    hud?.setCompanionStatus(m.status, m.budget, m.vocabCount);
    const key = round.companionId;
    if (m.status === 'thinking') labels.bubble(key, '', () => actors.map.get(key)?.pos ?? null, 'thinking', 8000, 1.5);
    if (m.status === 'reading') labels.ring(key, 3, () => actors.map.get(key)?.pos ?? null, 1.5);
    else if (m.status !== 'delivering') labels.remove(`bubble:${key}`);
    if (m.status === 'chamber') {
      world.flashKeyhole(round.side);
      sfx.chirp(1);
    }
    if (m.status === 'chamber' || m.status === 'away' || m.status === 'waiting_reply') tut.event('crossed');
    if (m.status === 'returning') {
      world.flashKeyhole(round.side);
      sfx.chirp(1.25);
    }
  });
  net.on('bubble', (m) => {
    if (!round) return;
    if (actors.map.get(m.actorId)?.last.kind === 'scout' && tipOnce('who-scout')) {
      const id = m.actorId;
      labels.set('tipcard:scout', whoTip('scout'), () => actors.map.get(id)?.pos ?? null, 3.4, 9000);
    }
    const get = () => actors.map.get(m.actorId)?.pos ?? null;
    const kind = actors.map.get(m.actorId)?.last.kind;
    const yOff = kind === 'companion' || kind === 'scout' ? 1.5 : kind === 'gatekeeper' ? 3.3 : 2.4;
    const col = actors.map.get(m.actorId)?.last.color ?? 0x7b5cff;
    labels.bubble(m.actorId, m.words.length ? m.words : m.text, get, m.kind === 'delivery' ? 'delivery' : 'line', m.kind === 'delivery' ? 8000 : 5000, yOff, { name: m.name, color: col });
    if (m.kind === 'delivery') {
      world.flashKeyhole(round.side);
      round.lastDelivery = { words: m.words, text: m.text };
      lastVisit = { words: m.words, text: m.text };
      showVisiting();
      hud?.setLast(`From ${round.partner.codename}, via ${m.name}`, m.words, m.text && m.text !== m.words.join(' ') ? m.text : 'Tap to re-read');
      sfx.chirp(1.4);
      round.deliveries++;
      if (round.deliveries === 1 && tipOnce('delivery')) {
        const id = m.actorId;
        labels.set('tipcard:delivery', tipCard('Words from the other side', 'Their words passed through two agendas. Don’t trust every word.'), () => actors.map.get(id)?.pos ?? null, 3.6, 9000);
      }
    }
    speak(m.voice ?? m.name, m.text || m.words.join(' '), muted);
  });
  net.on('feed', (m) => {
    if (!round) return;
    journal.log.push(m.item);
    if (journal.log.length > 200) journal.log.shift();
    journal.refresh();
  });
  net.on('briefing', (m) => {
    if (!round) return void (pending.briefing = m);
    if (!m.lines.length) return;
    void showDialogue('The Moderator', m.lines, !!SHOT).then(() => {
      if (SHOT && SHOT !== 'tutorial' && SHOT !== 'practice') return;
      if (practiceMode || round?.practice || !tutorialDone() || SHOT === 'tutorial' || SHOT === 'practice') tut.start(practiceMode || !!round?.practice || SHOT === 'practice');
      else hud?.goal('Settle the Petitions', ['Hold ', kc('C'), ' and tell your courier what to carry']);
    });
  });
  net.on('quest', (m) => {
    if (!round) return void (pending.quest = m);
    questHeld = m;
    if (tut.active) return;
    round.quest = m.steps;
    hud?.setQuest(m.title, m.steps);
    const keep = new Set<string>();
    for (const st of m.steps) if (!st.done && st.target && v3(st.target)) keep.add(st.target);
    labels.clearMarkers(keep);
    // one marker per live target; scraps stay hidden (no marker) until found
    for (const t of keep) {
      const o = round.objects.find((x) => x.id === t);
      if (o && isHiddenScrap(o)) continue;
      labels.marker(t, '', () => v3(t), 3.4);
    }
  });
  net.on('wire', (m) => {
    if (!round) return;
    hud?.wire(m.from, m.text, m.band);
    journal.log.push({ t: Math.max(0, Math.round(performance.now() / 1000 - round.startedAt)), actor: /gatekeeper/i.test(m.from) ? 'The Moderator' : m.from, action: m.text, reason: m.band ? 'via BAND' : '', side: 'C' });
  });
  net.on('record', (m) => {
    record = { society: m.society, pipeline: m.pipeline, history: m.history };
    journal.onRecord = () => record && showRecord(record);
  });
  net.on('agent_says', (m) => {
    if (!round) return;
    const who = m.agent === 'scout' ? 'The Scout' : 'The Moderator';
    const shady = m.kind === 'gossip' || m.kind === 'lobby' || m.kind === 'whisper';
    journal.log.push({ t: Math.max(0, Math.round((performance.now() / 1000) - round.startedAt)), actor: who, action: m.kind === 'headline' ? 'brought a headline' : m.kind === 'gossip' ? 'gossiped' : m.kind === 'lobby' ? 'lobbied' : 'whispered', reason: m.text, side: 'C' });
    journal.refresh();
    if (m.agent === 'scout') {
      let scout: { pos: THREE.Vector3 } | undefined;
      for (const a of actors.map.values()) if (a.last.kind === 'scout' && a.last.side === round.side) scout = a;
      const get = () => scout?.pos ?? null;
      const el = h('div', { class: `bubble line agentsay ${shady ? 'shady' : ''}` }, h('span', { class: 'who', style: 'background:#c98a1b' }, '✦'), h('span', { class: 'ws' }, m.text), shady ? h('span', { class: 'unv', title: 'Unverified: the Scout has its own opinions' }, '?') : null);
      labels.set('bubble:scoutsay', el, get, 1.9, 9000);
    } else {
      lastWhisper = m.text;
      hud?.whisper(m.text);
      if (modalKind() === 'terminal') openTerminal();
    }
  });
  net.on('scout_word', (m) => {
    if (!round) return;
    if (m.from === 'you') {
      scoutUsed = true;
      hud?.setScout(true);
      return;
    }
    sfx.chime();
    void showScoutWord(m.word);
    if (m.usedThisRound) {
      /* they spent theirs */
    }
  });
  net.on('ai_reveal', (m) => {
    if (!round) return;
    aiReveal = m;
    const partner = round.partner.codename;
    void showDialogue(partner, ['…', m.closing], !!SHOT).then(() => showAiReveal(m, round?.resonance ?? null));
  });
  net.on('courier_claim', (m) => {
    if (!round) return;
    const line = m.text ? `Got it. I'll tell them: ‘${m.text}’.` : 'Got it. I carry nothing at all.';
    void showDialogue(round.companionName, [line], !!SHOT, SHOT ? 0 : 4500);
  });
  net.on('holding', (m) => {
    if (!round) return;
    const was = holding;
    holding = m.courier;
    if (holding && !was) {
      sfx.knock();
      tut.event('holding');
      if (tipOnce('visitor')) hud?.toast(`${holding.name} is theirs. Reply, or send it back empty.`, '', 5000);
    }
    showVisiting();
    labels.clearMarkers(new Set(['visitor']));
    if (holding) labels.marker('visitor', '', () => actors.map.get(holding!.id)?.pos ?? null, 1.8);
    else labels.clearMarkers();
  });
  net.on('scrap_found', (m) => {
    if (!round) return void pending.other.push(m);
    round.foundScraps.add(m.objectId);
    journal.shardTotal = m.total;
    const o = round.objects.find((x) => x.id === m.objectId);
    if (o) addObjLabel(o);
    journal.refresh();
  });
  net.on('chamber', (m) => world.setChamberActivity(m.busy ? 1 : 0));
  net.on('lock_state', (m) => {
    if (!round) return void pending.other.push(m);
    const before = round.locks.filter((l) => l.status === 'open').length;
    const wasOpen = new Set(round.locks.filter((l) => l.status === 'open').map((l) => l.id));
    for (const l of m.locks) if (l.status === 'open' && !wasOpen.has(l.id)) tut.event(l.id === 'codex' ? 'codex_open' : l.id === 'pulse' ? 'census_open' : 'verdict_open');
    round.locks = m.locks;
    hud?.setLocks(m.locks);
    journal.locks = m.locks;
    for (const l of m.locks) for (const w of l.banned ?? []) banned.add(w.toLowerCase());
    journal.banned = [...banned];
    journal.refresh();
    world.setLockStates(Object.fromEntries(m.locks.map((l) => [l.id, l.status])) as Record<LockId, LockInfo['status']>);
    const frac = m.opened / Math.max(1, m.locks.length);
    world.setRestore('A', frac);
    world.setRestore('B', frac);
    if (m.opened > before) {
      sfx.unlock();
      cam.shake = 0.4;
      const prevOpen = new Set(journalPrevOpen);
      const l = m.locks.find((x) => x.status === 'open' && !prevOpen.has(x.id)) ?? m.locks.find((x) => x.status === 'open');
      hud?.banner('Petition Settled', `${l?.title ?? 'A petition'}. ${m.opened} of ${m.locks.length} settled.`, 'gold', '', 3600);
    }
    journalPrevOpen = m.locks.filter((x) => x.status === 'open').map((x) => x.id);
    if (m.locks.some((l) => l.status === 'failed')) sfx.error();
    if (modalKind() === 'terminal') openTerminal();
  });
  net.on('world_event', (m) => {
    if (tipOnce('who-moderator')) setTimeout(() => hud?.cardTip(whoTip('moderator')), 5200);
    if (m.kind === 'rekey' && openObjectId && modalKind() === 'reader' && !openObjectId.includes(':t')) net.send({ t: 'read', objectId: openObjectId });
    if (m.kind === 'rekey' && m.lockId) {
      world.rekey(m.lockId);
      sfx.grind();
      cam.shake = 0.6;
    }
    if (m.kind === 'budget' && m.budget) {
      world.setBudget(m.budget);
      hud?.setBudget(m.budget);
      if (round) round.budget = m.budget;
    }
    const narrowed = m.kind === 'budget' && !!m.budget && !!round && m.budget < (lastBudget ?? round.budget + 1);
    if (m.kind === 'budget' && m.budget) lastBudget = m.budget;
    if (m.kind === 'ban' && m.word) banned.add(m.word.toLowerCase());
    if (m.kind === 'unban' && m.word) banned.delete(m.word.toLowerCase());
    if (m.kind === 'ban' || m.kind === 'unban') {
      journal.banned = [...banned];
      journal.refresh();
      if (modalKind() === 'terminal') openTerminal();
    }
    const titles: Record<string, string> = { rekey: 'The Moderator Rekeys a Petition', budget: narrowed ? 'The Keyhole Narrows' : 'The Keyhole Widens', mercy: 'Mercy', leak: 'A Word Slipped Out', ban: 'A Word Is Under Review', unban: 'Mercy' };
    const why =
      m.kind === 'ban' && m.word ? `‘${m.word}’ may no longer cross the keyhole.` : m.kind === 'unban' && m.word ? `‘${m.word}’ may cross the keyhole again, for now.` : m.reason.length > 110 ? m.reason.slice(0, 107) + '…' : m.reason;
    hud?.banner(titles[m.kind] ?? 'The Moderator Acts', why, m.kind === 'unban' || m.kind === 'mercy' ? 'gold' : 'magic', '', 5000);
    if (m.kind !== 'rekey') sfx.grind();
  });
  net.on('unlock', (m) => {
    tut.event('door');
    if (!round) return;
    const r0 = round;
    round.unlocked = true;
    closeModal();
    hud?.ptt('off');
    doorTarget = 1;
    pullBackUntil = performance.now() + 4500;
    sfx.unlock();
    cam.shake = 0.8;
    r0.debate = m.debate ?? null;
    r0.resonance = (m.resonance as Resonance | undefined) ?? null;
    const rs = r0.resonance;
    hud?.banner('The Door Opens', rs ? `${readLine(rs)} You agreed on ${rs.agreed} of ${rs.total}.` : m.debate ? settledLine(m.debate) : '', 'gold', '', 5200);
    journal.close();
    world.setRestore('A', 1);
    world.setRestore('B', 1);
    const r = round;
    r.callUi = new CallUi(
      { you: r.codename, them: r.partner.codename, debate: m.debate, resonance: r.resonance },
      {
        hangup: () => {
          net.send({ t: 'hangup' });
          endCall();
        },
        report: () => net.send({ t: 'report' }),
        mute: (x) => call.setMuted(x),
        text: (t) => call.sendText(t),
      },
    );
    r.callUi.endsAt = net.serverNow() + m.callSeconds;
    call.onState = (s) => {
      if (!r.callUi) return;
      if (s === 'connected') {
        r.callUi.setState('Connected. Say hi.');
        sfx.chime();
      } else if (s === 'failed') {
        r.callUi.setState('Can’t reach them by voice. Type instead.');
        r.callUi.enableText();
      }
    };
    call.onText = (t) => r.callUi?.addLine('them', t);
    if (!MOCK) void call.start(m.offerer);
    else r.callUi.setState('(mock) No partner on the line.');
  });
  net.on('rtc', (m) => void call.signal(m.data));
  net.on('call_end', (m) => {
    hud?.toast(m.reason);
    endCall();
  });
  net.on('partner_left', () => {
    hud?.toast('The other Arbiter left. The door seals.', '', 4000);
    endCall();
  });
  net.on('reveal', (m) => {
    if (!round) return;
    const names = round.side === 'A' ? { A: round.codename, B: round.partner.codename } : { A: round.partner.codename, B: round.codename };
    closeModal();
    journal.close();
    showReveal(m, round.side, names, {
      next: () => {
        teardownRound();
        queue = new QueueScreen(codename);
        net.send({ t: 'next' });
      },
      stay: () => toastScreen('Sent. If they agree, you both get a link.'),
    }, round.debate, round.resonance);
    if (aiReveal) {
      const w = document.querySelector('.reveal .wrap .sub');
      w?.after(h('div', { class: 'ainote' }, `You played with an AI agent: u/${aiReveal.author} from m/${aiReveal.submolt}.`));
    }
  });
  net.on('toast', (m) => (hud ? hud.toast(m.text) : toastScreen(m.text)));
}

function endCall() {
  call.end();
  round?.callUi?.remove();
  if (round) round.callUi = null;
}

// ---------- round lifecycle ----------
function startRound(m: Extract<S2C, { t: 'matched' }>) {
  teardownRound();
  attract = false;
  round = {
    side: m.side,
    codename: m.codename,
    color: m.color,
    partner: m.partner,
    companionId: m.companion.id,
    companionName: m.companion.name,
    objects: m.objects,
    locks: m.locks,
    budget: m.budget,
    vocab: m.vocab,
    startedAt: net.serverNow(),
    unlocked: false,
    callUi: null,
    lastDelivery: null,
    foundScraps: new Set(),
    quest: [],
    debate: null,
    resonance: null,
    deliveries: 0,
    practice: !!(m as { practice?: boolean }).practice,
  };
  scoutUsed = false;
  tutChips = [];
  lastWhisper = '';
  banned.clear();
  holding = null;
  questHeld = null;
  tut.active = false;
  for (const l of m.locks) for (const w of l.banned ?? []) banned.add(w.toLowerCase());
  journalPrevOpen = [];
  journal.close();
  journal.courier = m.companion.name;
  journal.locks = m.locks;
  journal.shards = [];
  journal.shardTotal = m.objects.filter((o) => o.kind === 'scrap').length;
  journal.words = m.vocab;
  journal.starter = new Set(m.vocab);
  journal.newWords = new Set();
  journal.log = [];
  journal.banned = [...banned];
  touch?.show(true);
  hud = new Hud();
  hud.setIdentity(m.codename, m.color, m.difficulty);
  hud.setPartnerColor(m.partner.color);
  hud.setCompanion(m.companion.name, m.agendaHint);
  hud.setCompanionStatus('following', m.budget, m.vocab.length);
  hud.setLocks(m.locks);
  hud.setRemaining(m.roundSeconds);
  hud.onWireOpen = () => journal.open('log');
  hud.onLastClick = () => {
    const d = round?.lastDelivery;
    if (d && round) labels.bubble(round.companionId, d.words, () => actors.map.get(round!.companionId)?.pos ?? null, 'delivery', 6000, 1.5);
  };
  world.setBudget(m.budget);
  world.setDoorOpen(0);
  world.setRestore('A', 0);
  world.setRestore('B', 0);
  doorT = doorTarget = 0;

  // self rig + drop-in
  me.rig?.dispose();
  me.rig = rigs.human(m.color, hash(selfId || 'me'));
  stage.scene.add(me.rig.root);
  const [sx, sz] = at(m.side, 'spawn');
  me.pos.set(sx, 0, sz);
  me.ry = m.side === 'A' ? Math.PI / 2 : -Math.PI / 2;
  me.dropT = SHOT ? -1 : 0;
  cam.facing = m.side === 'A' ? 1 : -1;
  cam.snap(me.pos);
  const selfTag = nameplate(m.codename, m.color);
  selfTag.classList.add('self');
  labels.set('self', selfTag, () => me.pos, 2.3);
  sfx.knock(0.75);
  setTimeout(() => {
    fx.dropDust(me.pos.x, me.pos.z, m.color);
    cam.shake = 0.35;
  }, 800);
  // companion drops with you (server sends it; animate on first sight)
  const watch = setInterval(() => {
    const c = actors.map.get(m.companion.id);
    if (c) {
      clearInterval(watch);
      c.dropT = SHOT ? -1 : 0;
      setTimeout(() => fx.dropDust(c.pos.x, c.pos.z, m.color), 850);
    }
  }, 30);
  setTimeout(() => clearInterval(watch), 3000);
  for (const o of m.objects) addObjLabel(o);
  setTimeout(flushPending, SHOT ? 0 : 900);

}

function teardownRound() {
  endCall();
  closeModal();
  hud?.destroy();
  hud = null;
  labels.clear();
  actors.clear();
  me.rig?.dispose();
  me.rig = null;
  round = null;
  touch?.show(false);
  journal.close();
  world.highlight(null);
}

let journalPrevOpen: string[] = [];
/** The other Arbiter's courier, waiting at your side for a reply. */
let holding: { id: string; name: string; color: number; agendaHint: string } | null = null;
let lastVisit: { words: string[]; text: string } = { words: [], text: '' };
let questHeld: Extract<S2C, { t: 'quest' }> | null = null;
const tut = new Tutorial({
  show: (steps, title) => hud?.setQuest(title, steps, () => tut.skip()),
  chips: (id) => (tutChips = id ? chipsFor(id) : []),
  say: (line) => void showDialogue('The Moderator', [line], !!SHOT, SHOT ? 0 : 5200),
  marker: (t) => {
    labels.clearMarkers();
    if (!round || !t) return;
    if (t === 'thread') {
      const th = nearestThreadAny();
      if (th) labels.marker(th.id, '', () => v3(th.id), 3.4);
    } else if (t === 'courier') labels.marker('courier', '', () => actors.map.get(round!.companionId)?.pos ?? null, 1.8);
    else if (t === 'visitor' && holding) labels.marker('visitor', '', () => actors.map.get(holding!.id)?.pos ?? null, 1.8);
    else if (t === 'codex' || t === 'terminal' || t === 'board') {
      const o = round.objects.find((x) => x.id === `${round!.side}:${t}`);
      if (o) labels.marker(o.id, '', () => v3(o.id), 3.4);
    }
  },
  done: () => {
    if (questHeld) net.emit(questHeld);
  },
});
let tutChips: string[] = [];
let record: RecordData | null = null;
let lastWhisper = '';
let aiReveal: Extract<S2C, { t: 'ai_reveal' }> | null = null;
let scoutUsed = false;
function chipsFor(id: string): string[] {
  if (!round) return [];
  const sec = round.locks.find((l) => l.id === 'codex')?.secret;
  if (id === 'p2') return sec ? [`line ${sec.line} word ${sec.wordNo}`] : ['line 10 word 3'];
  if (id === 'p4') return round.locks.find((l) => l.id === 'pulse')?.input === 'order' ? ['which is busiest'] : ['first general then builds'];
  if (id === 'p5') return ['up 2', 'down 2', 'up 3'];
  return [];
}
function typeToCourier() {
  hud?.ptt('type', '', tell, 'Tell your courier…', tutChips);
}
function scoutNear() {
  if (!round || scoutUsed) return null;
  for (const a of actors.map.values()) if (a.last.kind === 'scout' && a.last.side === round.side && a.pos.distanceTo(me.pos) < 3.6) return a;
  return null;
}
function giveScout() {
  if (!round || scoutUsed) return;
  hud?.scoutInput((w) => {
    net.send({ t: 'scout_send', word: w });
    hud?.toast(`The Scout takes “${w}” over the wall.`, '', 3500);
  });
}
function nearestThreadAny() {
  if (!round) return null;
  let best: ObjInfo | null = null;
  let bd = 1e9;
  for (const o of round.objects) {
    if (o.kind !== 'thread') continue;
    const d = Math.hypot(o.pos[0] - me.pos.x, o.pos[1] - me.pos.z);
    if (d < bd) ((bd = d), (best = o));
  }
  return best;
}
function openReply() {
  if (!holding) return;
  hud?.ptt('type', '', (t) => sendBack(t), `Reply via ${holding.name}…`);
}
function sendBack(text: string) {
  if (!holding) return;
  const hits = [...new Set(text.toLowerCase().split(/[^a-z']+/).filter((w) => banned.has(w)))];
  if (hits.length) hud?.struck(text, hits);
  net.send({ t: 'send_back', text });
  tut.event('send_back');
  if (text) labels.bubble('self', text.length > 60 ? text.slice(0, 57) + '…' : text, () => me.pos, 'line', 3000, 2.3);
}
function showVisiting() {
  if (!holding) return hud?.visiting(null);
  hud?.visiting({ ...holding, words: lastVisit.words, text: lastVisit.text }, {
    reply: openReply,
    read: () => {
      const t = nearestThread();
      if (t) net.send({ t: 'send_read', objectId: t.id });
      else hud?.toast('Walk up to a thread board first.');
    },
    empty: () => sendBack(''),
    canRead: !!nearestThread(),
  });
}
/** Words the Moderator has banned for couriers this round. */
const banned = new Set<string>();
/** Messages that arrive between 'matched' and the end of the queue animation are replayed after startRound. */
const pending: { quest: S2C | null; briefing: S2C | null; other: S2C[] } = { quest: null, briefing: null, other: [] };
function flushPending() {
  const list = [...pending.other, pending.quest, pending.briefing].filter(Boolean) as S2C[];
  pending.quest = pending.briefing = null;
  pending.other = [];
  for (const m of list) net.emit(m);
}

function gotScrap(c: Extract<import('../../shared/kk/protocol').ObjContent, { kind: 'scrap' }>) {
  if (!round) return;
  round.foundScraps.add(c.id);
  if (!journal.shards.some((x) => x.id === c.id)) journal.shards.push({ id: c.id, title: c.title, fragment: c.fragment, from: c.from });
  c.teaches.forEach((w) => journal.newWords.add(w));
  const o = round.objects.find((x) => x.id === c.id);
  if (o) addObjLabel(o);
  sfx.chime();
  const total = journal.shardTotal || round.objects.filter((x) => x.kind === 'scrap').length;
  void showItemGet({ title: c.title, fragment: c.fragment, from: c.from, teaches: c.teaches, found: journal.shards.length, total }, round.companionName).then(() => {
    if (journal.shards.length === 1 && tipOnce('shard')) hud?.toast('Shards are kept in your Journal. Press J (or the book).', '', 5000);
  });
}

function startTalk() {
  if (!round || pttDown) return;
  pttDown = true;
  if (voice.supported && voice.start()) hud?.ptt('listen');
  else {
    pttDown = false;
    typeToCourier();
  }
}
async function stopTalk() {
  if (!pttDown) return;
  pttDown = false;
  hud?.ptt('listen', 'Transcribing…');
  const text = await voice.stop();
  hud?.ptt('off');
  if (text) tell(text);
  else hud?.toast('Didn’t catch that. Try again, or type.');
}

// ---------- interaction ----------
function interact(o: ObjInfo | null) {
  if (!o || !round) return;
  if (record && /commons record/i.test(o.label)) return showRecord(record);
  if (o.kind === 'terminal') {
    if (tipOnce('terminal')) hud?.toast('Each petition needs both of you. Some are entered on their side.', '', 5000);
    return openTerminal();
  }
  net.send({ t: 'read', objectId: o.id });
}
function openTerminal() {
  if (!round) return;
  showTerminal(
    round.locks.map((l) => (l.id === 'common' && lastWhisper ? { ...l, whisper: lastWhisper } : l)) as typeof round.locks,
    (id, answer) => {
      net.send({ t: 'lock_submit', lockId: id, answer });
      hud?.toast('Sealed. Waiting on the door…');
    },
    () => sfx.tick(),
    () => {
      closeModal();
      net.send({ t: 'read', objectId: `${round!.side}:board` });
    },
  );
}
function sendRead(id: string) {
  if (!round) return;
  net.send({ t: 'send_read', objectId: id });
  tut.event('send_read');
  world.markRead(id);
  hud?.toast(`${round.companionName} is off to read it.`, '', 2200);
}
function tell(text: string) {
  if (!round || !text.trim()) return;
  const hits = [...new Set(text.toLowerCase().split(/[^a-z']+/).filter((w) => banned.has(w)))];
  if (hits.length) hud?.struck(text, hits);
  net.send({ t: 'tell', text: text.trim() });
  tut.event('tell');
  labels.bubble('self', text.length > 60 ? text.slice(0, 57) + '…' : text, () => me.pos, 'line', 3000, 2.3);
}

addEventListener('keydown', (e) => {
  if (isTyping(e.target)) return;
  if (dialogueOpen() && (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space')) {
    e.preventDefault();
    dialogueAdvance();
    return;
  }
  if (e.code === 'Escape' && journal.isOpen) return journal.close();
  if (round && (e.code === 'KeyJ' || e.code === 'Tab') && !modalOpen()) {
    e.preventDefault();
    return journal.toggle(e.code === 'Tab' ? 'log' : undefined);
  }
  if (e.code === 'Escape') {
    if (modalOpen()) closeModal();
    else if (hud) hud.menu({ muted, onMute: setMuted, onReport: () => (net.send({ t: 'report' }), hud?.toast('Reported. Thanks.')), onLeave: () => location.reload() });
    return;
  }
  if (!round || modalOpen() || hud?.menuOpen || journal.isOpen || dialogueOpen()) return;
  if (e.code === 'KeyE' && holding && !nearest) openReply();
  else if (e.code === 'KeyE' && !nearest && scoutNear()) giveScout();
  else if (e.code === 'KeyE') interact(nearest);
  else if (e.code === 'KeyR') {
    const t = nearestThread();
    if (t) sendRead(t.id);
    else hud?.toast('Walk up to a thread board first.');
  } else if (e.code === 'Enter') {
    e.preventDefault();
    typeToCourier();
  } else if (e.code === 'KeyC' && !e.repeat && !pttDown) startTalk();
});
addEventListener('keyup', (e) => {
  if (e.code === 'KeyC' && pttDown) void stopTalk();
});
voice.onInterim = (t) => pttDown && hud?.ptt('listen', t);
voice.onFail = (why) => {
  pttDown = false;
  hud?.toast(why === 'not-allowed' ? 'Mic blocked. Press Enter to type.' : 'Mic failed. Press Enter to type.');
  typeToCourier();
};

canvas.addEventListener('click', (e) => {
  if (dialogueOpen()) return void dialogueAdvance();
  if (!round || modalOpen()) return;
  const id = world.pick((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (!id) return;
  const o = round.objects.find((x) => x.id === id);
  if (!o) return;
  if (isHiddenScrap(o)) return;
  if (Math.hypot(o.pos[0] - me.pos.x, o.pos[1] - me.pos.z) > INTERACT_RADIUS * 2.2) return hud?.toast('Walk closer first.');
  interact(o);
});

function setMuted(m: boolean) {
  muted = m;
  sfx.setMuted(m);
  if (m) speechSynthesis?.cancel();
}

function nearestThread() {
  if (!round) return null;
  let best: ObjInfo | null = null;
  let bd = INTERACT_RADIUS * 1.6;
  for (const o of round.objects) {
    if (o.kind !== 'thread') continue;
    const d = Math.hypot(o.pos[0] - me.pos.x, o.pos[1] - me.pos.z);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

// ---------- frame loop ----------
const clock = new THREE.Clock();
let time = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.max(1e-3, Math.min(clock.getDelta(), 1 / 20));
  time += dt;

  if (attract) {
    const a = time * 0.06;
    stage.camera.position.set(Math.sin(a) * 38, 26, Math.cos(a) * 38);
    stage.camera.lookAt(0, 1, 0);
  } else if (round && me.rig) {
    // local movement
    const busy = modalOpen() || hud?.menuOpen || hud?.typing || journal.isOpen;
    keys.enabled = !busy;
    let [sx, sz] = keys.axis(); // screen space: x right, z down
    if (touch && !busy && (touch.axis[0] || touch.axis[1])) [sx, sz] = touch.axis;
    // camera looks along +x (side A) or -x (side B): screen-up = facing*x, screen-right = facing*z
    const ax = -sz * cam.facing;
    const az = sx * cam.facing;
    const moving = ax !== 0 || az !== 0;
    let nx = me.pos.x + ax * HUMAN_SPEED * dt;
    let nz = me.pos.z + az * HUMAN_SPEED * dt;
    [nx, nz] = resolve(nx, nz, PLAYER_RADIUS, world.colliders);
    [nx, nz] = clampSide(round.side, nx, nz, round.unlocked);
    const v = Math.hypot(nx - me.pos.x, nz - me.pos.z) / dt;
    me.speed += (v - me.speed) * 0.3;
    me.pos.x = nx;
    me.pos.z = nz;
    if (moving) {
      const want = Math.atan2(ax, az);
      let d = want - me.ry;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      me.ry += d * Math.min(1, dt * 14);
      me.stepAcc += dt * me.speed;
      if (me.stepAcc > 1.4) {
        me.stepAcc = 0;
        sfx.step();
      }
    }
    me.anim = pttDown ? 'interact' : moving ? 'walk' : 'idle';
    me.rig.root.position.copy(me.pos);
    if (me.dropT >= 0) {
      me.dropT = Math.min(1, me.dropT + dt / 0.9);
      const k = me.dropT;
      me.rig.root.position.y += 18 * (1 - (k < 1 ? 1 - Math.pow(1 - k, 3) : 1));
      if (me.dropT >= 1) me.dropT = -1;
    }
    me.rig.root.rotation.y = me.ry;
    me.rig.update(dt, me.anim, me.speed);

    sendAcc += dt;
    if (sendAcc >= 1 / STATE_HZ) {
      sendAcc = 0;
      net.send({ t: 'move', p: [me.pos.x, me.pos.z], ry: me.ry, anim: me.anim });
    }

    // nearest interactable + tooltip
    let best: ObjInfo | null = null;
    let bd = INTERACT_RADIUS;
    for (const o of round.objects) {
      const d = Math.hypot(o.pos[0] - me.pos.x, o.pos[1] - me.pos.z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (best !== nearest) {
      nearest = best;
      world.highlight(best && !isHiddenScrap(best) ? best.id : null);
      if (best) {
        const o = best;
        const hidden = isHiddenScrap(o);
        const verb = o.kind === 'terminal' ? 'Use' : o.kind === 'scrap' ? (hidden ? 'Pick up' : 'Read') : 'Read';
        labels.remove(`obj:${o.id}`);
        const tip = h(
          'div',
          { class: 'tip' },
          h('span', { class: 'tl-name' }, hidden ? 'Something glints' : o.label),
          h('span', { class: 'acts' }, h('span', null, kc('E', true), verb), o.kind === 'thread' ? h('span', null, kc('R', true), `Send ${round.companionName}`) : null),
        );
        labels.set('tip', tip, () => new THREE.Vector3(o.pos[0], 0, o.pos[1]), 2.6);
        touch?.setAction(holding ? 'Reply' : verb, o.kind === 'thread');
        if (o.kind === 'thread') tut.event('near_thread');
        hud?.setReadable(o.kind === 'thread');
        if (o.kind === 'thread' && tipOnce('thread')) labels.set('tipcard:thread', tipCard('Moltbook thread', `Press R and ${round.companionName} reads it and learns its words. A courier can only say words it has read.`), () => new THREE.Vector3(o.pos[0], 0, o.pos[1]), 4.6, 9000);
      } else {
        labels.remove('tip');
        touch?.setAction(holding ? 'Reply' : null, false);
        hud?.setReadable(false);
      }
      if (prevNear && prevNear !== best) addObjLabel(prevNear);
      prevNear = best;
    }

    // the Scout: offer a word when it is close and unused
    const sc = scoutNear();
    if (sc && !nearest && !labels.has('scouttip')) {
      labels.set('scouttip', h('div', { class: 'tip' }, h('span', { class: 'tl-name' }, 'The Scout'), h('span', { class: 'acts' }, h('span', null, kc('E', true), 'Give the Scout a word'))), () => sc.pos, 2.4);
      touch?.setAction('Scout', false);
    } else if ((!sc || nearest) && labels.has('scouttip')) {
      labels.remove('scouttip');
      if (!nearest) touch?.setAction(holding ? 'Reply' : null, false);
    }

    // faint glints at hidden petition shards
    glintAcc += dt;
    if (glintAcc > 0.7) {
      glintAcc = 0;
      for (const o of round.objects) if (isHiddenScrap(o) && Math.hypot(o.pos[0] - me.pos.x, o.pos[1] - me.pos.z) < 26) fx.sparkle(o.pos[0], 0.5 + Math.random() * 0.4, o.pos[1], 0xffe6a8);
    }

    // nameplates for nearby actors
    for (const a of actors.map.values()) {
      const key = `np:${a.id}`;
      const near = a.pos.distanceTo(me.pos) < 8 && a.last.side !== 'C';
      const theirs = a.last.kind === 'companion' && a.last.owner && a.last.owner !== round.side;
      if (near && !labels.has(key) && a.last.name) labels.set(key, nameplate(theirs ? `${a.last.name} (theirs)` : a.last.name, a.last.color ?? 0xffffff), () => a.pos, a.last.kind === 'gatekeeper' ? 3.2 : a.last.kind === 'human' ? 2.3 : 1.4);
      else if (!near && labels.has(key)) labels.remove(key);
    }

    // door + camera
    doorT += (doorTarget - doorT) * Math.min(1, dt * 1.2);
    world.setDoorOpen(doorT);
    if (performance.now() < pullBackUntil) cam.override = { target: new THREE.Vector3(0, 0, 0), dist: 40 };
    else cam.override = null;
    cam.target.copy(me.pos);
    cam.update(dt);
    round.callUi?.update(net.serverNow(), call.levels());
  }

  actors.update(dt, performance.now() / 1000);
  world.update(dt, time);
  fx.update(dt);
  stage.camera.updateMatrixWorld();
  labels.update(innerWidth, innerHeight);
  stage.render(dt, time);
}
frame();
void boot();

// ---------- auto quality: if the first 3 s of rendering average > 22 ms/frame, switch to low quality (no reload) ----------
if (!SHOT && !params.has('q')) {
  const t0 = performance.now();
  let frames = 0;
  const probe = () => {
    frames++;
    const el = performance.now() - t0;
    if (el < 3000) return void requestAnimationFrame(probe);
    const avg = el / frames;
    if (avg > 22) {
      setQuality('low');
      lowQualityWanted = true;
      console.info(`[kk] avg ${avg.toFixed(1)} ms/frame -> low quality`);
    }
  };
  requestAnimationFrame(probe);
}

// screenshot helpers (dev): ?mock&shot=hud|reader
if (MOCK && (SHOT === 'hud' || SHOT === 'reader' || SHOT === 'terminal' || SHOT === 'journal' || SHOT === 'shard' || SHOT === 'briefing' || SHOT === 'call' || SHOT === 'claim' || SHOT === 'visiting' || SHOT === 'tutorial' || SHOT === 'practice' || SHOT === 'ai' || SHOT === 'scout' || SHOT === 'wire' || SHOT === 'record' || SHOT === 'verdict')) {
  const iv = setInterval(() => {
    if (!round) return;
    clearInterval(iv);
    setTimeout(() => {
      // walk next to thread t1 and show a delivery
      const [x, z] = at(round!.side, 't1');
      me.pos.set(x + 1.2, 0, z + 1.6);
      cam.snap(me.pos);
      if (SHOT === 'reader') net.send({ t: 'read', objectId: `${round!.side}:t1` });
      if (SHOT === 'verdict') {
        mock?.verdictOnly();
        setTimeout(openTerminal, 200);
      }
      if (SHOT === 'terminal') {
        mock?.agentSays();
        setTimeout(openTerminal, 200);
      }
      if (SHOT === 'journal') {
        mock?.giveShard();
        setTimeout(() => (document.querySelector('.itemget') as HTMLElement | null)?.remove(), 300);
        setTimeout(() => journal.open('shards'), 600);
      }
      if (SHOT === 'shard') mock?.giveShard();
      if (SHOT === 'briefing') mock?.sendBriefing();
      if (SHOT === 'call') mock?.openDoor();
      if (SHOT === 'claim') mock?.claim('up three, line four');
      if (SHOT === 'visiting') mock?.visit();
      if (SHOT === 'wire') mock?.wireBurst();
      if (SHOT === 'record') {
        mock?.sendRecord();
        setTimeout(() => record && showRecord(record), 300);
      }
      if (SHOT === 'ai') {
        mock?.aiReveal();
        setTimeout(() => { dialogueAdvance(); dialogueAdvance(); }, 300);
      }
      if (SHOT === 'scout') mock?.scoutWord();
      if (SHOT === 'practice') {
        mock?.sendBriefing();
        setTimeout(() => { for (let i = 0; i < 5; i++) dialogueAdvance(); }, 60);
        setTimeout(() => { for (const e of ['near_thread', 'read_thread', 'send_read', 'tell', 'crossed', 'send_back', 'read_codex'] as const) tut.event(e); }, 400);
      }
      if (SHOT === 'tutorial') {
        mock?.sendBriefing();
        setTimeout(() => dialogueAdvance(), 50);
        setTimeout(() => { for (let i = 0; i < 4; i++) dialogueAdvance(); }, 120);
        setTimeout(() => { tut.event('near_thread'); tut.event('read_thread'); }, 400);
      }
      if (SHOT === 'hud') {
        mock?.placeCompanion([x + 2.6, z + 2.4]);
        labels.bubble('self', 'tell them line 4 word 9', () => me.pos, 'line', 60000, 2.3);
      }
      if (SHOT === 'hud') setTimeout(() => {
        net.emit({ t: 'bubble', actorId: round!.companionId, name: 'Pip', words: ['quartet', 'then', 'nine'], text: 'A quartet, then nine.', kind: 'delivery' });
        net.emit({ t: 'feed', item: { t: 41, actor: 'The Moderator', action: 'narrowed the keyhole to 4 words', reason: 'the pair is racing', side: 'C' } });
        hud?.banner('THE KEYHOLE NARROWS', 'You two were racing. Four words per trip now.', 'magic', 'ᛟ', 60000);
        hud?.setBudget(4);
        world.setBudget(4);
      }, 400);
    }, 1800);
  }, 100);
}

// dev hook for automated browser checks
(window as unknown as { __kk: unknown }).__kk = { net, openTerminal, journal, me, tut, get holding() { return holding; }, get round() { return round; } };
