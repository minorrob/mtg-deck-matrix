// Callout detection: compares the previous and next view and names the moments.
// Only reads the view; nothing here changes the game.
import { displayName, locationMap } from './derive';
import type { RoomView } from './types';

export type CalloutTone = 'harm' | 'answer' | 'growth' | 'value' | 'fade';
export type CalloutKind =
  | 'incoming' | 'response' | 'hit' | 'critical' | 'ko' | 'blocked' | 'saved' | 'countered' | 'counters' | 'proliferate'
  | 'tokens' | 'life-gain' | 'life-loss' | 'fatal' | 'destroyed' | 'exiled' | 'your-turn' | 'game-over' | 'emote';

export interface Callout {
  id: string;
  kind: CalloutKind;
  tone: CalloutTone;
  word: string;
  number?: string;
  life?: { name: string; from: number; to: number };
  readout?: string[];
  anchor?: { seat?: number; cardId?: number; stack?: boolean };
}

let n = 0;
const mk = (c: Omit<Callout, 'id'>): Callout => ({ ...c, id: `co-${Date.now()}-${n++}` });

export const CALLOUT_SAMPLES: Record<CalloutKind, () => Callout> = {
  incoming: () => mk({ kind: 'incoming', tone: 'harm', word: 'Incoming', readout: ["Garruk's Packleader · 4/4 · → you", 'Block first, then the stack resolves top-down'], anchor: { seat: 2 } }),
  response: () => mk({ kind: 'response', tone: 'answer', word: 'Response', readout: ['Swan Song → Colossification', 'Colossification'], anchor: { stack: true } }),
  hit: () => mk({ kind: 'hit', tone: 'harm', word: 'Hit', number: '-4', readout: ["Garruk's Packleader → you · life 36"], anchor: { seat: 0 } }),
  critical: () => mk({ kind: 'critical', tone: 'harm', word: 'Critical', number: '-12', anchor: { seat: 1 } }),
  ko: () => mk({ kind: 'ko', tone: 'harm', word: 'KO', readout: ['Friend fell to 0 life'], anchor: { seat: 1 } }),
  blocked: () => mk({ kind: 'blocked', tone: 'answer', word: 'Blocked', readout: ['Walking Bulwark stopped 6 damage'], anchor: { seat: 2 } }),
  saved: () => mk({ kind: 'saved', tone: 'answer', word: 'Saved', readout: ['Indestructible held'], anchor: { seat: 0 } }),
  countered: () => mk({ kind: 'countered', tone: 'answer', word: 'Countered', readout: ['Colossification by Swan Song'], anchor: { stack: true } }),
  counters: () => mk({ kind: 'counters', tone: 'growth', word: '+1/+1', number: '+3', readout: ['Thrummingbird · now 4/4'], anchor: { seat: 0 } }),
  proliferate: () => mk({ kind: 'proliferate', tone: 'growth', word: 'Proliferate', readout: ['Ugin · loyalty 8', 'Thrummingbird · +1/+1 ×2'], anchor: { seat: 0 } }),
  tokens: () => mk({ kind: 'tokens', tone: 'value', word: 'Tokens', number: '×2', readout: ['Soldier ×2'], anchor: { seat: 3 } }),
  'life-gain': () => mk({ kind: 'life-gain', tone: 'growth', word: 'Life', number: '+3', readout: ['AI 2 · 44'], anchor: { seat: 2 } }),
  'life-loss': () => mk({ kind: 'life-loss', tone: 'harm', word: 'Life', number: '-2', anchor: { seat: 0 } }),
  fatal: () => mk({ kind: 'fatal', tone: 'harm', word: 'Fatal', readout: ['21 commander damage from Yoshimaru'], anchor: { seat: 1 } }),
  destroyed: () => mk({ kind: 'destroyed', tone: 'harm', word: 'Destroyed', readout: ['Walking Bulwark → graveyard'], anchor: { seat: 2 } }),
  exiled: () => mk({ kind: 'exiled', tone: 'fade', word: 'Exiled', readout: ['Bofur → exile'], anchor: { seat: 3 } }),
  'your-turn': () => mk({ kind: 'your-turn', tone: 'value', word: 'Your turn', anchor: { seat: 0 } }),
  'game-over': () => mk({ kind: 'game-over', tone: 'value', word: 'Game over', anchor: {} }),
  emote: () => mk({ kind: 'emote', tone: 'value', word: 'GG', anchor: { seat: 1 } }),
};

export function detectCallouts(prev: RoomView | null, next: RoomView): Callout[] {
  if (!prev || prev.matchId !== next.matchId) return [];
  if (next.revision <= prev.revision) return [];
  const out: Callout[] = [];
  const me = next.seat;
  const P = new Map(prev.state.players.map((p) => [p.playerId, p]));

  // Game over
  if (next.status === 'finished' && prev.status !== 'finished') {
    out.push(mk({ kind: 'game-over', tone: 'value', word: 'Game over', readout: [next.result?.reason ?? ''], anchor: {} }));
    return out;
  }
  // Your turn
  if (next.state.turnPlayerId === me && prev.state.turnPlayerId !== me && me >= 0) out.push(mk({ kind: 'your-turn', tone: 'value', word: 'Your turn', anchor: { seat: me } }));

  // Incoming attacks at you
  const prevAtk = new Set((prev.state.combat?.attacks ?? []).map((a) => `${a.attacker}>${a.defender}`));
  const incoming = (next.state.combat?.attacks ?? []).filter((a) => a.defender === me && !prevAtk.has(`${a.attacker}>${a.defender}`));
  if (incoming.length && next.state.combat) {
    const loc = locationMap(next);
    out.push(mk({
      kind: 'incoming', tone: 'harm', word: 'Incoming', number: incoming.length > 1 ? `×${incoming.length}` : undefined,
      readout: incoming.map((a) => {
        const c = loc.get(a.attacker)?.card;
        return `${c?.name ?? 'Attacker'} · ${c?.power ?? '?'}/${c?.toughness ?? '?'}${c?.keywords.length ? ' · ' + c.keywords.join(', ') : ''} · → ${a.planeswalker ? 'your planeswalker' : 'you'}`;
      }),
      anchor: { seat: next.state.combat.attackingPlayerId },
    }));
  }
  // Blocks
  const prevBlocked = new Set((prev.state.combat?.attacks ?? []).filter((a) => a.blocked).map((a) => a.attacker));
  const newlyBlocked = (next.state.combat?.attacks ?? []).filter((a) => a.blocked && !prevBlocked.has(a.attacker));
  if (newlyBlocked.length) out.push(mk({ kind: 'blocked', tone: 'answer', word: 'Blocked', anchor: { cardId: newlyBlocked[0].blockers[0] } }));

  // Response: added to a non-empty stack
  if (next.state.stack.length > prev.state.stack.length && prev.state.stack.length > 0) {
    out.push(mk({ kind: 'response', tone: 'answer', word: 'Response', readout: [...next.state.stack].reverse().slice(0, 4).map((s) => `${s.faceDown ? 'Face-down spell' : s.name} · ${displayName(next, s.playerId)}`), anchor: { stack: true } }));
  }

  // History-driven moments (public text only)
  const prevTop = prev.history[0]?.text;
  const fresh: string[] = [];
  for (const h of next.history) {
    if (h.text === prevTop) break;
    fresh.push(h.text);
    if (fresh.length > 20) break;
  }
  for (const t of fresh) {
    if (/countered/i.test(t)) out.push(mk({ kind: 'countered', tone: 'answer', word: 'Countered', readout: [t], anchor: { stack: true } }));
    else if (/proliferate/i.test(t)) out.push(mk({ kind: 'proliferate', tone: 'growth', word: 'Proliferate', readout: [t] }));
    else {
      const m = /created (\d+) .*tokens?/i.exec(t);
      if (m) out.push(mk({ kind: 'tokens', tone: 'value', word: 'Tokens', number: `×${m[1]}`, readout: [t], anchor: { seat: next.state.turnPlayerId ?? undefined } }));
    }
  }

  // Life and fatal thresholds
  const combatStep = next.state.phase === 'COMBAT_DAMAGE' || next.state.phase === 'COMBAT_FIRST_STRIKE_DAMAGE';
  for (const p of next.state.players) {
    const q = P.get(p.playerId);
    if (!q) continue;
    const d = p.health.life - q.health.life;
    if (d < 0) {
      const lost = p.health.status !== 'active' && q.health.status === 'active';
      if (combatStep) out.push(mk({ kind: lost ? 'ko' : d <= -10 ? 'critical' : 'hit', tone: 'harm', word: lost ? 'KO' : d <= -10 ? 'Critical' : 'Hit', number: `${d}`, readout: [`${displayName(next, p.playerId)} · life ${p.health.life}`], anchor: { seat: p.playerId } }));
      else out.push(mk({ kind: 'life-loss', tone: 'harm', word: 'Life', number: `${d}`, readout: [`${displayName(next, p.playerId)} · ${p.health.life}`], anchor: { seat: p.playerId } }));
    } else if (d > 0) out.push(mk({ kind: 'life-gain', tone: 'growth', word: 'Life', number: `+${d}`, readout: [`${displayName(next, p.playerId)} · ${p.health.life}`], anchor: { seat: p.playerId } }));
    const cmd = Math.max(0, ...Object.values(p.health.commanderDamage));
    const qcmd = Math.max(0, ...Object.values(q.health.commanderDamage));
    if ((p.health.poison >= 10 && q.health.poison < 10) || (cmd >= 21 && qcmd < 21)) out.push(mk({ kind: 'fatal', tone: 'harm', word: 'Fatal', readout: [p.health.poison >= 10 ? '10 poison counters' : '21 commander damage'], anchor: { seat: p.playerId } }));
  }

  // Zone moves from the battlefield; counters placed
  const prevLoc = locationMap(prev);
  const nextLoc = locationMap(next);
  let destroyed = 0;
  for (const [id, was] of prevLoc) {
    if (was.zone !== 'Battlefield') continue;
    const now = nextLoc.get(id);
    if (now?.zone === 'Graveyard' && destroyed < 2) {
      destroyed++;
      out.push(mk({ kind: 'destroyed', tone: 'harm', word: 'Destroyed', readout: [`${was.card.name ?? 'Permanent'} → graveyard`], anchor: { cardId: id } }));
    } else if (now?.zone === 'Exile') out.push(mk({ kind: 'exiled', tone: 'fade', word: 'Exiled', readout: [`${was.card.name ?? 'Permanent'} → exile`], anchor: { cardId: id } }));
  }
  for (const [id, now] of nextLoc) {
    if (now.zone !== 'Battlefield') continue;
    const was = prevLoc.get(id);
    for (const k of ['+1/+1', 'loyalty']) {
      const a = now.card.counters[k] ?? 0;
      const b = was?.zone === 'Battlefield' ? was.card.counters[k] ?? 0 : 0;
      if (a > b) out.push(mk({ kind: 'counters', tone: 'growth', word: k === 'loyalty' ? 'Loyalty' : '+1/+1', number: `+${a - b}`, readout: [`${now.card.name} · ${k} ${a}`], anchor: { cardId: id } }));
    }
  }
  for (const c of out) {
    if (!['life-gain', 'life-loss', 'hit', 'critical', 'ko'].includes(c.kind)) continue;
    const after = next.state.players.find((p) => p.playerId === c.anchor?.seat);
    const before = after && P.get(after.playerId);
    if (after && before) c.life = { name: displayName(next, after.playerId), from: before.health.life, to: after.health.life };
  }
  return out.slice(0, 6);
}
