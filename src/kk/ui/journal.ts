// Arbiter's Journal (J): How it works · Petitions · Shards · Courier's words · Log.
import type { FeedItem, LockInfo } from '../../../shared/kk/protocol';
import { fmtTime, h, ui } from './dom';
import { dia, kc } from './hud';

export type JournalTab = 'how' | 'petitions' | 'shards' | 'words' | 'log';
export interface ShardEntry {
  id: string;
  title: string;
  fragment: string;
  from: string;
}

export class Journal {
  locks: LockInfo[] = [];
  shards: ShardEntry[] = [];
  shardTotal = 0;
  words: string[] = [];
  newWords = new Set<string>();
  starter = new Set<string>();
  log: FeedItem[] = [];
  banned: string[] = [];
  courier = 'your courier';
  private el: HTMLElement | null = null;
  private tab: JournalTab = 'how';

  get isOpen() {
    return !!this.el;
  }
  toggle(tab?: JournalTab) {
    if (this.el && (!tab || tab === this.tab)) return this.close();
    this.open(tab ?? this.tab);
  }
  close() {
    this.el?.remove();
    this.el = null;
  }
  refresh() {
    if (this.el) this.open(this.tab);
  }
  open(tab: JournalTab) {
    this.tab = tab;
    this.el?.remove();
    const tabs: [JournalTab, string, string?][] = [
      ['how', 'How it works'],
      ['petitions', 'Petitions', `${this.locks.filter((l) => l.status === 'open').length}/${this.locks.length || 3}`],
      ['shards', 'Shards', `${this.shards.length}/${this.shardTotal || '?'}`],
      ['words', `${this.courier}'s words`, String(this.words.length)],
      ['log', 'Log'],
    ];
    const head = h(
      'div',
      { class: 'jhead' },
      h('div', { class: 'jt' }, "Arbiter's Journal"),
      h(
        'div',
        { class: 'tabs' },
        tabs.map(([id, label, n]) => {
          const b = h('button', { class: `tab ${id === tab ? 'on' : ''}` }, id === tab ? dia('fill') : null, label, n ? h('span', { class: 'n' }, n) : null);
          b.onclick = () => this.open(id);
          return b;
        }),
      ),
      h('button', { class: 'icon-btn', title: 'Close (J)', onclick: () => this.close() }, '✕'),
    );
    const body = h('div', { class: 'jbody' }, this.body(tab));
    this.el = h('div', { class: 'journal', onclick: (e: Event) => e.target === this.el && this.close() }, h('div', { class: 'jbox frame solid' }, head, body));
    ui().append(this.el);
  }
  private body(tab: JournalTab): HTMLElement {
    switch (tab) {
      case 'how':
        return h(
          'ul',
          { class: 'rules' },
          rule('You and another Arbiter are sealed on either side of the Wall.', 'You will not hear them until the door opens.'),
          rule(`Every word between you is carried by your courier, ${this.courier}.`, 'Hold C (or tap the mic) and say what to carry. It squeezes through the keyhole a few words at a time.'),
          rule('A courier can only say words it has read.', 'Walk to a Moltbook thread and press R to send it to read. Numbers always pass.'),
          rule('Couriers have agendas.', 'What arrives may be bent, poetic or missing a word. Check twice when it matters.'),
          rule('Opinion words are under review.', 'Yes, no, agree and their cousins never cross the keyhole. Invent another way: numbers, directions, words you have read.'),
          rule('Settle the three petitions at the terminal.', 'Petition shards hidden around the Commons hold what the boards leave out.'),
        );
      case 'petitions':
        return h(
          'div',
          { class: 'pets' },
          (this.locks.length ? this.locks : []).map((l) =>
            h('div', { class: 'pet' }, h('h4', null, dia(l.status === 'open' ? 'fill' : ''), l.title, h('span', { class: `st ${l.status}` }, l.status === 'open' ? 'Settled' : l.status === 'waiting' ? 'Waiting on them' : l.enterHere ? 'Enter on your side' : 'Entered on their side')), h('p', null, l.prompt), l.partnerStatus ? h('p', { style: 'color: var(--them)' }, l.partnerStatus) : null),
          ),
        );
      case 'shards': {
        const missing = Math.max(0, this.shardTotal - this.shards.length);
        return h(
          'div',
          { class: 'shards' },
          this.shards.map((s) => h('div', { class: 'shardcard' }, h('h5', null, dia('fill'), s.title), h('p', null, s.fragment), s.from ? h('div', { class: 'from' }, `from ${s.from}`) : null)),
          Array.from({ length: missing }, () => h('div', { class: 'shardcard missing' }, h('h5', null, dia(), 'Not yet found'), h('div', { class: 'from' }, 'Look for a faint glint somewhere in the Commons.'))),
        );
      }
      case 'words': {
        const sorted = [...this.words].sort((a, b) => Number(this.starter.has(a)) - Number(this.starter.has(b)) || a.localeCompare(b));
        return h(
          'div',
          null,
          h('p', { class: 'fine', style: 'text-align:left; margin-bottom:12px' }, `${this.courier} can only carry these words (plus any number). New ones glow.`),
          h('div', { class: 'words' }, sorted.map((w) => h('span', { class: `word ${this.newWords.has(w) ? 'new' : ''} ${this.starter.has(w) ? 'starter' : ''}` }, w))),
          this.banned.length ? h('h4', { class: 'jsub' }, 'Banned by the Moderator') : null,
          this.banned.length ? h('div', { class: 'words' }, this.banned.map((w) => h('span', { class: 'word banned' }, h('s', null, w)))) : null,
        );
      }
      case 'log':
        return h(
          'div',
          { class: 'pets' },
          this.log.length
            ? [...this.log].reverse().map((it) => h('div', { class: 'pet', style: 'padding:10px 14px' }, h('h4', { style: 'font-size:15px' }, dia(it.side === 'C' ? 'fill' : ''), `${/gatekeeper/i.test(it.actor) ? 'The Moderator' : it.actor} ${it.action}`, h('span', { class: 'st' }, fmtTime(it.t))), it.reason ? h('p', null, it.reason) : null))
            : h('p', { class: 'fine', style: 'text-align:left' }, 'Nothing yet. Every agent decision lands here with its reason.'),
        );
    }
  }
}

function rule(main: string, sub: string) {
  return h('li', null, dia('fill'), h('div', null, main, h('small', null, sub)));
}
export const journalPrompt = () => h('span', null, kc('J', true), 'Journal');
