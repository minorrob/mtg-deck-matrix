// DEMO SCRIPT — synthetic frames, NOT rules.
// A hand-written state machine that produces CrankRoomView@1-shaped frames so the
// card travel (draw, cast, resolve, scry, graveyard), combat and callouts can be
// felt. It never claims legality: every offer is scripted. Real play replaces this
// whole file with the server.
import { cloneView, FIXTURES } from './fixtures';
import type { AnswerFrame, CardView, DecisionOption, Phase, PlayerView, RoomView, StackEntry } from './types';

export interface Emission {
  delay: number;
  view: RoomView;
}

function card(cardId: number, name: string, owner: number, types: string[], power: number | null = null, toughness: number | null = null, keywords: string[] = [], extra: Partial<CardView> = {}): CardView {
  return { cardId, name, faceDown: false, owner, controller: owner, tapped: false, damage: 0, counters: {}, types, power, toughness, keywords, commander: false, ...extra };
}

const MANA_OF: Record<string, string> = { Island: 'U', 'Command Tower': 'U', 'Access Tunnel': 'C', 'Everflowing Chalice': 'C' };
const COST: Record<string, string> = {
  Opt: '{U}', Colossification: '{5}{G}{G}', 'Ugin, the Spirit Dragon': '{8}', 'Soul of New Phyrexia': '{6}',
  'Faerie Formation': '{4}{U}', 'Valkyrie Harbinger': '{4}{W}{W}', 'Spectral Sailor': '{U}',
};
const DRAW_POOL: [string, string[], number | null, number | null, string[]][] = [
  ['Valkyrie Harbinger', ['Creature'], 4, 5, ['Flying', 'Lifelink']],
  ['Island', ['Land'], null, null, []],
  ['Opt', ['Instant'], null, null, []],
  ['Faerie Formation', ['Creature'], 5, 4, ['Flying']],
  ['Island', ['Land'], null, null, []],
];

export class DemoScript {
  v: RoomView;
  private rev = 5000;
  private nextId = 9100;
  private nextStack = 900;
  private lastTap: number | null = null;
  private drawIdx = 0;
  private stage: 'priority' | 'scry' | 'attack' | 'damage' | 'blocks' | 'amount' | 'ack' | 'mulligan' = 'priority';
  private scryCard: CardView | null = null;
  private oppAttack: { attacker: number; owner: number } | null = null;

  constructor() {
    const v = cloneView(FIXTURES[7]);
    v.matchId = 'demo-script';
    v.__synthetic = 'Demo script · synthetic frames, not rules';
    const me = v.state.players[0];
    const keep = new Set(['Command Tower', 'Soul of New Phyrexia', 'Faerie Formation']);
    me.zones.Hand.cards = me.zones.Hand.cards.filter((c) => keep.has(c.name ?? ''));
    const soul = me.zones.Hand.cards.find((c) => c.name === 'Soul of New Phyrexia');
    if (soul) soul.keywords = ['Trample'];
    me.zones.Hand.cards.push(
      card(9001, 'Opt', 0, ['Instant']),
      card(9002, 'Colossification', 0, ['Enchantment']),
      card(9003, 'Ugin, the Spirit Dragon', 0, ['Planeswalker']),
    );
    me.zones.Battlefield.cards.forEach((c) => (c.tapped = false));
    me.landsPlayed = 0;
    me.mana = [];
    const ai2 = v.state.players[2];
    ai2.zones.Battlefield.cards.push(card(9010, "Garruk's Packleader", 2, ['Creature'], 4, 4, []));
    for (const p of v.state.players) this.recount(p);
    v.state.phase = 'UPKEEP';
    v.state.turnPlayerId = 0;
    v.state.priorityPlayerId = 0;
    v.state.stack = [];
    v.state.stackSize = 0;
    v.state.combat = null;
    v.yourTurn = 4;
    v.history = [
      { turn: 13, text: 'Turn 13 · Rob', mark: 'turn' },
      { turn: 13, text: 'Demo script started from recorded view rev 91 (synthetic from here on)' },
    ];
    this.v = v;
    this.setPriority();
  }

  // ---------- helpers ----------
  private me(): PlayerView {
    return this.v.state.players[0];
  }
  private p(id: number): PlayerView {
    return this.v.state.players.find((x) => x.playerId === id)!;
  }
  private recount(p: PlayerView) {
    for (const z of Object.values(p.zones)) {
      if (z === p.zones.Library) continue;
      z.count = z.cards.length + z.hiddenCount;
    }
  }
  private log(text: string, mark?: 'turn' | 'quiet' | 'end') {
    this.v.history = [{ turn: this.v.state.turn, text, ...(mark ? { mark } : {}) }, ...this.v.history].slice(0, 120);
  }
  private snap(delay: number): Emission {
    this.rev += 1;
    this.v.revision = this.rev;
    for (const p of this.v.state.players) this.recount(p);
    this.v.state.stackSize = this.v.state.stack.length;
    return { delay, view: structuredClone(this.v) };
  }
  private waitOn(seat: number) {
    this.v.decision = null;
    this.v.waitingOn = `s${seat}`;
    this.v.continuing = seat !== 0;
    this.v.state.priorityPlayerId = seat;
  }
  private setPhase(ph: Phase) {
    this.v.state.phase = ph;
    for (const p of this.v.state.players) p.mana = [];
    this.lastTap = null;
  }
  private take(p: PlayerView, zone: 'Hand' | 'Battlefield', id: number): CardView | undefined {
    const z = p.zones[zone];
    const i = z.cards.findIndex((c) => c.cardId === id);
    if (i < 0) return undefined;
    return z.cards.splice(i, 1)[0];
  }
  private drawFor(p: PlayerView, known?: CardView) {
    p.zones.Library.count -= 1;
    p.zones.Library.hiddenCount = Math.max(0, p.zones.Library.hiddenCount - 1);
    if (p.playerId === 0) {
      let c = known;
      if (!c) {
        const d = DRAW_POOL[this.drawIdx++ % DRAW_POOL.length];
        c = card(this.nextId++, d[0], 0, d[1], d[2], d[3], d[4]);
      }
      p.zones.Hand.cards.push(c);
      this.log('You drew a card');
    } else {
      p.zones.Hand.hiddenCount += 1;
      p.zones.Hand.count += 1;
      this.log(`${p.name} drew a card`);
    }
  }

  // ---------- priority options (scripted, labeled as such) ----------
  private setPriority() {
    const s = this.v.state;
    const me = this.me();
    const opts: Omit<DecisionOption, 'index'>[] = [];
    opts.push({ label: 'Pass priority', act: 'pass', ...(s.phase === 'END_OF_TURN' && s.turnPlayerId === 0 ? { endsTurn: true } : {}) });
    const myMain = s.turnPlayerId === 0 && (s.phase === 'MAIN1' || s.phase === 'MAIN2') && s.stack.length === 0;
    for (const c of me.zones.Hand.cards) {
      if (c.types.includes('Land')) {
        if (myMain && me.landsPlayed === 0) opts.push({ label: c.name!, act: 'play-land', cardId: c.cardId });
        continue;
      }
      const instant = c.types.includes('Instant');
      if (!myMain && !instant) continue;
      if (c.name === 'Colossification') {
        opts.push({ label: 'Cast Colossification', act: 'cast', cardId: c.cardId, detail: '→ Thrummingbird', targets: [{ kind: 'object', id: 485 }] });
        opts.push({ label: 'Cast Colossification', act: 'cast', cardId: c.cardId, detail: "→ Garruk's Packleader", lean: 'helps AI 2', hostile: false, targets: [{ kind: 'object', id: 9010 }] });
      } else {
        opts.push({ label: `Cast ${c.name}`, act: 'cast', cardId: c.cardId, detail: COST[c.name ?? ''] ?? '' });
      }
    }
    for (const c of me.zones.Battlefield.cards) {
      if (c.tapped) continue;
      if (MANA_OF[c.name ?? '']) opts.push({ label: c.name!, act: 'activate-mana', cardId: c.cardId, detail: `{${MANA_OF[c.name!]}}` });
    }
    if (this.lastTap != null) {
      const c = me.zones.Battlefield.cards.find((x) => x.cardId === this.lastTap);
      if (c) opts.push({ label: `Untap ${c.name}`, act: 'undo-mana', cardId: c.cardId, detail: 'its mana unspent' });
    }
    this.v.decision = {
      id: `priority:demo:${this.rev + 1}`,
      title: 'Your priority',
      mode: 'one',
      min: 1,
      max: 1,
      kind: 'priority',
      options: opts.map((o, index) => ({ ...o, index }) as DecisionOption),
    };
    this.v.waitingOn = 's0';
    this.v.continuing = false;
    s.priorityPlayerId = 0;
    this.stage = 'priority';
  }

  start(): RoomView {
    return this.snap(0).view;
  }

  // ---------- answers ----------
  answer(f: AnswerFrame): Emission[] {
    const d = this.v.decision;
    if (!d) return [];
    const picks = f.indices ?? [];
    switch (this.stage) {
      case 'priority':
        return this.onPriority(d.options[picks[0]]);
      case 'scry':
        return this.onScry(picks.length > 0);
      case 'attack':
        return this.onAttack(picks.map((i) => d.options[i]));
      case 'damage':
        return this.onDamage(f.amounts ?? []);
      case 'blocks':
        return this.onBlocks(picks.map((i) => d.options[i]));
      case 'amount':
        return this.onAmount(f.amounts ?? []);
      case 'ack':
        return this.ourTurn();
      default:
        return [];
    }
  }

  private onPriority(o: DecisionOption | undefined): Emission[] {
    if (!o) return [];
    const me = this.me();
    const s = this.v.state;
    if (o.act === 'play-land') {
      const c = this.take(me, 'Hand', o.cardId!)!;
      me.zones.Battlefield.cards.push(c);
      me.landsPlayed += 1;
      this.log(`You played ${c.name}`);
      this.setPriority();
      return [this.snap(0)];
    }
    if (o.act === 'activate-mana') {
      const c = me.zones.Battlefield.cards.find((x) => x.cardId === o.cardId)!;
      c.tapped = true;
      const col = MANA_OF[c.name ?? ''] ?? 'C';
      const m = me.mana.find((x) => x.color === col);
      if (m) m.amount += 1;
      else me.mana.push({ color: col, amount: 1 });
      this.lastTap = c.cardId;
      this.setPriority();
      return [this.snap(0)];
    }
    if (o.act === 'undo-mana') {
      const c = me.zones.Battlefield.cards.find((x) => x.cardId === o.cardId)!;
      c.tapped = false;
      const col = MANA_OF[c.name ?? ''] ?? 'C';
      me.mana = me.mana.map((x) => (x.color === col ? { ...x, amount: x.amount - 1 } : x)).filter((x) => x.amount > 0);
      this.lastTap = null;
      this.setPriority();
      return [this.snap(0)];
    }
    if (o.act === 'cast') return this.cast(o);
    if (o.act === 'pass') {
      if (s.stack.length > 0) return this.resolveTop();
      return this.advanceStep();
    }
    return [];
  }

  private cast(o: DecisionOption): Emission[] {
    const me = this.me();
    const c = this.take(me, 'Hand', o.cardId!)!;
    me.mana = [];
    this.lastTap = null;
    const entry: StackEntry = { stackId: this.nextStack++, cardId: c.cardId, name: c.name, faceDown: false, playerId: 0, kind: 'spell', stage: 'waiting', targets: (o.targets as StackEntry['targets']) ?? [] };
    this.v.state.stack.push(entry);
    this.pendingCards.set(c.cardId, c);
    this.log(`You cast ${c.name}${o.detail && o.detail.startsWith('→') ? ' ' + o.detail : ''}`);
    this.waitOn(1);
    const out: Emission[] = [this.snap(0)];
    if (c.name === 'Colossification') {
      const ai2 = this.p(2);
      ai2.zones.Hand.hiddenCount -= 1;
      ai2.zones.Hand.count -= 1;
      const swan = card(this.nextId++, 'Swan Song', 2, ['Instant']);
      this.pendingCards.set(swan.cardId, swan);
      this.v.state.stack.push({ stackId: this.nextStack++, cardId: swan.cardId, name: 'Swan Song', faceDown: false, playerId: 2, kind: 'spell', stage: 'waiting', targets: [{ kind: 'object', id: c.cardId }] });
      this.log('AI 2 cast Swan Song targeting Colossification');
      this.setPriority();
      out.push(this.snap(700));
      return out;
    }
    out.push(...this.resolveTop(650));
    return out;
  }

  private pendingCards = new Map<number, CardView>();

  private resolveTop(delay = 0): Emission[] {
    const s = this.v.state;
    const top = s.stack[s.stack.length - 1];
    if (!top) return [];
    const c = this.pendingCards.get(top.cardId ?? -1);
    const owner = this.p(top.playerId);
    if (c?.name === 'Opt') {
      top.stage = 'resolving';
      const me = this.me();
      const d = DRAW_POOL[this.drawIdx++ % DRAW_POOL.length];
      this.scryCard = card(this.nextId++, d[0], 0, d[1], d[2], d[3], d[4]);
      this.v.decision = {
        id: `scry:demo:${top.stackId}`,
        title: 'Scry 1: choose any to put on the bottom of your library',
        mode: 'many', min: 0, max: 1,
        options: [{ index: 0, label: this.scryCard.name!, cardId: this.scryCard.cardId }],
      };
      this.v.waitingOn = 's0';
      this.v.continuing = false;
      s.priorityPlayerId = 0;
      this.stage = 'scry';
      void me;
      return [this.snap(delay)];
    }
    s.stack.pop();
    if (!c) {
      this.setPriority();
      return [this.snap(delay)];
    }
    if (c.name === 'Swan Song') {
      const target = s.stack.pop();
      const tc = target ? this.pendingCards.get(target.cardId ?? -1) : undefined;
      owner.zones.Graveyard.cards.push(c);
      if (tc) this.me().zones.Graveyard.cards.push(tc);
      this.log('Colossification was countered by Swan Song');
      this.log('AI 2 created a Bird token for you — demo omits it');
      this.setPriority();
      return [this.snap(delay)];
    }
    if (c.types.includes('Instant') || c.types.includes('Sorcery')) owner.zones.Graveyard.cards.push(c);
    else {
      if (c.types.includes('Planeswalker')) c.counters = { loyalty: 7 };
      owner.zones.Battlefield.cards.push(c);
    }
    this.log(`${c.name} resolved`);
    this.setPriority();
    return [this.snap(delay)];
  }

  private onScry(bottom: boolean): Emission[] {
    const me = this.me();
    const s = this.v.state;
    const sc = this.scryCard!;
    this.log(bottom ? 'You put a card on the bottom of your library' : 'You left a card on top of your library');
    this.v.decision = null;
    this.v.waitingOn = 's0';
    const out = [this.snap(0)];
    const top = s.stack.pop();
    const opt = top ? this.pendingCards.get(top.cardId ?? -1) : undefined;
    this.drawFor(me, bottom ? undefined : sc);
    if (opt) me.zones.Graveyard.cards.push(opt);
    this.log('Opt resolved');
    this.scryCard = null;
    this.setPriority();
    out.push(this.snap(520));
    return out;
  }

  private advanceStep(): Emission[] {
    const s = this.v.state;
    const me = this.me();
    const out: Emission[] = [];
    switch (s.phase) {
      case 'UNTAP':
      case 'UPKEEP': {
        this.setPhase('DRAW');
        this.drawFor(me);
        this.setPriority();
        out.push(this.snap(0));
        return out;
      }
      case 'DRAW':
        this.setPhase('MAIN1');
        this.setPriority();
        return [this.snap(0)];
      case 'MAIN1': {
        const attackers = me.zones.Battlefield.cards.filter((c) => c.types.includes('Creature') && !c.tapped);
        this.setPhase('COMBAT_BEGIN');
        if (attackers.length === 0) {
          this.log('Beginning of combat, Declare attackers, End of combat: nothing to do', 'quiet');
          this.setPhase('MAIN2');
          this.setPriority();
          return [this.snap(0)];
        }
        this.setPhase('COMBAT_DECLARE_ATTACKERS');
        const opps = s.players.filter((p) => p.playerId !== 0 && p.health.status === 'active');
        const options: DecisionOption[] = [];
        for (const a of attackers) for (const o of opps) options.push({ index: options.length, label: `${a.name} → ${o.name}`, cardId: a.cardId, defenderId: o.playerId });
        this.v.decision = { id: `declare-attackers:demo:${s.turn}`, title: 'Declare attackers', mode: 'many', min: 0, max: attackers.length, exclusiveBy: 'cardId', options };
        this.v.waitingOn = 's0';
        this.stage = 'attack';
        return [this.snap(0)];
      }
      case 'MAIN2':
        this.setPhase('END_OF_TURN');
        this.setPriority();
        return [this.snap(0)];
      case 'END_OF_TURN':
        return this.opponentTurns();
      default:
        this.setPhase('MAIN2');
        this.setPriority();
        return [this.snap(0)];
    }
  }

  private onAttack(picks: DecisionOption[]): Emission[] {
    const s = this.v.state;
    const me = this.me();
    if (picks.length === 0) {
      this.log('You declared no attackers');
      this.setPhase('MAIN2');
      this.setPriority();
      return [this.snap(0)];
    }
    s.combat = { attackingPlayerId: 0, defenders: [...new Set(picks.map((p) => p.defenderId!))], attacks: picks.map((p) => ({ attacker: p.cardId!, defender: p.defenderId!, blocked: false, blockers: [] })) };
    for (const p of picks) {
      const c = me.zones.Battlefield.cards.find((x) => x.cardId === p.cardId);
      if (c && !c.keywords.includes('Vigilance')) c.tapped = true;
    }
    this.log(`You attacked with ${picks.map((p) => p.label.split(' → ')[0]).join(', ')}`);
    this.waitOn(1);
    const out = [this.snap(0)];
    // A defender with an untapped creature blocks the biggest attacker aimed at it.
    this.setPhase('COMBAT_DECLARE_BLOCKERS');
    let blockedSoul: { attack: number; blocker: CardView; attacker: CardView } | null = null;
    for (const [i, atk] of s.combat.attacks.entries()) {
      const def = this.p(atk.defender);
      const blocker = def.zones.Battlefield.cards.find((c) => c.types.includes('Creature') && !c.tapped && !s.combat!.attacks.some((a) => a.blockers.includes(c.cardId)));
      const attacker = me.zones.Battlefield.cards.find((c) => c.cardId === atk.attacker)!;
      if (blocker && (attacker.power ?? 0) >= 2) {
        atk.blocked = true;
        atk.blockers = [blocker.cardId];
        this.log(`${def.name} blocked ${attacker.name} with ${blocker.name}`);
        if (attacker.keywords.includes('Trample') || (attacker.power ?? 0) > (blocker.toughness ?? 0)) blockedSoul = { attack: i, blocker, attacker };
        break;
      }
    }
    if (blockedSoul && blockedSoul.attacker.keywords.includes('Trample')) {
      const lethal = Math.max(1, (blockedSoul.blocker.toughness ?? 1) - blockedSoul.blocker.damage);
      const def = this.p(s.combat.attacks[blockedSoul.attack].defender);
      this.v.decision = {
        id: `assign-damage:demo:${blockedSoul.attacker.cardId}`,
        title: `Assign ${blockedSoul.attacker.power} damage`,
        mode: 'damage', min: 0, max: blockedSoul.attacker.power ?? 0,
        total: blockedSoul.attacker.power ?? 0, minEach: 0,
        options: [
          { index: 0, label: blockedSoul.blocker.name!, cardId: blockedSoul.blocker.cardId, lethal },
          { index: 1, label: `${def.name} (trample)`, defender: true, defenderId: def.playerId },
        ],
      };
      this.v.waitingOn = 's0';
      this.v.continuing = false;
      this.stage = 'damage';
      out.push(this.snap(700));
      return out;
    }
    out.push(...this.combatDamage([], 700));
    return out;
  }

  private onDamage(amounts: number[]): Emission[] {
    return this.combatDamage(amounts, 0);
  }

  private combatDamage(assign: number[], delay: number): Emission[] {
    const s = this.v.state;
    const me = this.me();
    const combat = s.combat!;
    this.setPhase('COMBAT_DAMAGE');
    let lifelink = 0;
    for (const atk of combat.attacks) {
      const a = me.zones.Battlefield.cards.find((c) => c.cardId === atk.attacker);
      if (!a) continue;
      const def = this.p(atk.defender);
      let toPlayer = a.power ?? 0;
      if (atk.blocked && atk.blockers.length) {
        const b = def.zones.Battlefield.cards.find((c) => c.cardId === atk.blockers[0]);
        const toBlocker = assign.length ? assign[0] : toPlayer;
        toPlayer = assign.length ? assign[1] ?? 0 : 0;
        if (b) {
          b.damage += toBlocker;
          a.damage += b.power ?? 0;
          this.log(`${a.name} dealt ${toBlocker} to ${b.name}`);
          if (b.damage >= (b.toughness ?? 99)) {
            this.take(def, 'Battlefield', b.cardId);
            b.damage = 0;
            def.zones.Graveyard.cards.push(b);
            this.log(`${b.name} went to the graveyard`);
          }
        }
      }
      if (toPlayer > 0) {
        const before = def.health.life;
        def.health.life -= toPlayer;
        def.life = def.health.life;
        if (a.commander && a.commanderKey) {
          def.health.commanderDamage[a.commanderKey] = (def.health.commanderDamage[a.commanderKey] ?? 0) + toPlayer;
          def.health.commanderDamageMax = Math.max(...Object.values(def.health.commanderDamage));
        }
        this.log(`${a.name} dealt ${toPlayer} to ${def.name}`);
        this.log(`${def.name}: ${before} → ${def.health.life} life`);
        if (a.keywords.includes('Lifelink')) lifelink += toPlayer;
      }
    }
    if (lifelink) {
      me.health.life += lifelink;
      me.life = me.health.life;
      this.log(`You gained ${lifelink} life`);
    }
    this.waitOn(1);
    const out = [this.snap(delay)];
    s.combat = null;
    for (const p of s.players) for (const c of p.zones.Battlefield.cards) c.damage = 0;
    this.setPhase('MAIN2');
    this.setPriority();
    out.push(this.snap(900));
    return out;
  }

  // ---------- the other seats (scripted AI turns, < 5 s total) ----------
  private opponentTurns(): Emission[] {
    const s = this.v.state;
    const out: Emission[] = [];
    // Friend
    s.turn += 1;
    s.turnPlayerId = 1;
    this.setPhase('UPKEEP');
    this.log(`Turn ${s.turn} · Friend`, 'turn');
    const f = this.p(1);
    this.drawFor(f);
    this.waitOn(1);
    out.push(this.snap(0));
    this.setPhase('MAIN1');
    f.zones.Hand.hiddenCount -= 1;
    const isl = card(this.nextId++, 'Island', 1, ['Land']);
    f.zones.Battlefield.cards.push(isl);
    this.log('Friend played Island');
    out.push(this.snap(650));
    f.zones.Hand.hiddenCount -= 1;
    const sailor = card(this.nextId++, 'Spectral Sailor', 1, ['Creature'], 1, 1, ['Flying', 'Flash']);
    f.zones.Battlefield.cards.push(sailor);
    this.log('Friend cast Spectral Sailor');
    this.log('Spectral Sailor resolved');
    out.push(this.snap(650));
    // AI 2 attacks you
    s.turn += 1;
    s.turnPlayerId = 2;
    this.setPhase('UPKEEP');
    this.log(`Turn ${s.turn} · AI 2`, 'turn');
    const a2 = this.p(2);
    this.drawFor(a2);
    this.waitOn(2);
    out.push(this.snap(650));
    const pack = a2.zones.Battlefield.cards.find((c) => c.cardId === 9010) ?? a2.zones.Battlefield.cards.find((c) => c.types.includes('Creature'));
    if (pack) {
      this.setPhase('COMBAT_DECLARE_ATTACKERS');
      pack.tapped = true;
      s.combat = { attackingPlayerId: 2, defenders: [0], attacks: [{ attacker: pack.cardId, defender: 0, blocked: false, blockers: [] }] };
      this.log(`AI 2 attacked with ${pack.name}`);
      this.oppAttack = { attacker: pack.cardId, owner: 2 };
      this.setPhase('COMBAT_DECLARE_BLOCKERS');
      const mine = this.me().zones.Battlefield.cards.filter((c) => c.types.includes('Creature') && !c.tapped);
      this.v.decision = {
        id: `declare-blockers:demo:${s.turn}`,
        title: 'Declare blockers',
        mode: 'many', min: 0, max: mine.length, exclusiveBy: 'cardId',
        options: mine.map((c, index) => ({ index, label: `${c.name} blocks ${pack.name}`, cardId: c.cardId })),
      };
      this.v.waitingOn = 's0';
      this.v.continuing = false;
      s.priorityPlayerId = 0;
      this.stage = 'blocks';
      out.push(this.snap(700));
      return out;
    }
    out.push(...this.ai3Turn(700));
    return out;
  }

  private onBlocks(picks: DecisionOption[]): Emission[] {
    const s = this.v.state;
    const me = this.me();
    const a2 = this.p(2);
    const atk = s.combat?.attacks[0];
    const attacker = a2.zones.Battlefield.cards.find((c) => c.cardId === this.oppAttack?.attacker);
    const out: Emission[] = [];
    if (atk && attacker) {
      if (picks.length) {
        atk.blocked = true;
        atk.blockers = picks.map((p) => p.cardId!);
        this.log(`You blocked ${attacker.name} with ${picks.map((p) => p.label.split(' blocks ')[0]).join(', ')}`);
        this.waitOn(2);
        out.push(this.snap(0));
        this.setPhase('COMBAT_DAMAGE');
        for (const bid of atk.blockers) {
          const b = me.zones.Battlefield.cards.find((c) => c.cardId === bid);
          if (!b) continue;
          attacker.damage += b.power ?? 0;
          if ((attacker.power ?? 0) >= (b.toughness ?? 99)) {
            this.take(me, 'Battlefield', b.cardId);
            me.zones.Graveyard.cards.push(b);
            this.log(`${attacker.name} dealt ${attacker.power} to ${b.name}`);
            this.log(`${b.name} went to the graveyard`);
          }
        }
        this.log(`${attacker.name} was blocked; no damage to you`);
      } else {
        this.waitOn(2);
        out.push(this.snap(0));
        this.setPhase('COMBAT_DAMAGE');
        const before = me.health.life;
        me.health.life -= attacker.power ?? 0;
        me.life = me.health.life;
        this.log(`${attacker.name} dealt ${attacker.power} to Rob`);
        this.log(`Rob: ${before} → ${me.health.life} life`);
      }
      out.push(this.snap(600));
      s.combat = null;
      attacker.damage = 0;
      this.setPhase('MAIN2');
      a2.health.life += 3;
      a2.life = a2.health.life;
      this.log('AI 2 gained 3 life');
      out.push(this.snap(650));
    }
    out.push(...this.ai3Turn(650));
    return out;
  }

  private ai3Turn(delay: number): Emission[] {
    const s = this.v.state;
    const a3 = this.p(3);
    s.turn += 1;
    s.turnPlayerId = 3;
    this.setPhase('UPKEEP');
    this.log(`Turn ${s.turn} · AI 3`, 'turn');
    this.drawFor(a3);
    this.waitOn(3);
    const out = [this.snap(delay)];
    this.setPhase('MAIN1');
    a3.zones.Battlefield.cards.push(card(this.nextId++, 'Soldier', 3, ['Creature'], 1, 1), card(this.nextId++, 'Soldier', 3, ['Creature'], 1, 1));
    this.log('AI 3 created 2 Soldier tokens');
    out.push(this.snap(650));
    this.v.decision = { id: `reveal:demo:${s.turn}`, title: 'AI 3 revealed the top card of their library: Sol Ring', mode: 'ack', min: 0, max: 0, options: [] };
    this.v.waitingOn = 's0';
    this.v.continuing = false;
    this.stage = 'ack';
    out.push(this.snap(650));
    return out;
  }

  private ourTurn(): Emission[] {
    const s = this.v.state;
    const me = this.me();
    s.turn += 1;
    s.turnPlayerId = 0;
    this.v.yourTurn = (this.v.yourTurn ?? 0) + 1;
    this.setPhase('UNTAP');
    for (const c of me.zones.Battlefield.cards) c.tapped = false;
    me.landsPlayed = 0;
    this.log(`Turn ${s.turn} · Rob`, 'turn');
    this.v.decision = null;
    this.v.waitingOn = 's0';
    const out = [this.snap(0)];
    this.setPhase('UPKEEP');
    const creatures = me.zones.Battlefield.cards.filter((c) => c.types.includes('Creature'));
    if (creatures.length) {
      this.v.decision = {
        id: `distribute:demo:${s.turn}`,
        title: 'Sigil of Growth (demo trigger): distribute three +1/+1 counters among your creatures',
        mode: 'amount', min: 0, max: 3, total: 3, minEach: 0, divide: true,
        options: creatures.map((c, index) => ({ index, label: c.name!, cardId: c.cardId })),
      };
      this.stage = 'amount';
    } else this.setPriority();
    out.push(this.snap(500));
    return out;
  }

  private onAmount(amounts: number[]): Emission[] {
    const d = this.v.decision!;
    const me = this.me();
    d.options.forEach((o, i) => {
      const n = amounts[i] ?? 0;
      if (!n) return;
      const c = me.zones.Battlefield.cards.find((x) => x.cardId === o.cardId);
      if (!c) return;
      c.counters['+1/+1'] = (c.counters['+1/+1'] ?? 0) + n;
      if (c.power != null) c.power += n;
      if (c.toughness != null) c.toughness += n;
      this.log(`${c.name} got ${n} +1/+1 counter${n > 1 ? 's' : ''}`);
    });
    this.setPriority();
    return [this.snap(0)];
  }
}
