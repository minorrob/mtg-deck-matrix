import sample from '@/data/sample-views.json';
import type { RoomView } from './types';
import { phaseLabel } from './derive';

interface SampleFile {
  schema: string;
  about: string;
  seed: unknown;
  decks: { seatId: string; deck: string; commander: string[] }[];
  result: unknown;
  turns: number;
  decisionsInGame: unknown;
  kept: number;
  views: RoomView[];
}

export const SAMPLE = sample as unknown as SampleFile;
export const FIXTURES: RoomView[] = SAMPLE.views;

export function cloneView(v: RoomView): RoomView {
  return structuredClone(v);
}

export interface FixtureMeta {
  index: number;
  revision: number;
  turn: number;
  phase: string;
  title: string;
  mode: string;
  permanents: number;
  stack: number;
  tags: string[];
}

export const FIXTURE_META: FixtureMeta[] = FIXTURES.map((v, index) => {
  const permanents = v.state.players.reduce((a, p) => a + p.zones.Battlefield.count, 0);
  const tags: string[] = [];
  const t = v.decision?.title ?? '';
  if (/Keep this hand|bottom of your library/.test(t)) tags.push('mulligan');
  if (/attackers/.test(t)) tags.push('attackers');
  if (/blockers/.test(t)) tags.push('blockers');
  if (/Search/.test(t)) tags.push('search');
  if (/Surveil|Scry/.test(t)) tags.push('surveil');
  if (v.state.stackSize > 0) tags.push('stack');
  if (v.status === 'finished') tags.push('game over');
  if (v.decision?.mode === 'order') tags.push('order');
  return {
    index,
    revision: v.revision,
    turn: v.state.turn,
    phase: v.state.phase ? phaseLabel(v.state.phase) : 'Opening hand',
    title: v.decision?.title ?? (v.status === 'finished' ? 'Game over' : 'Waiting'),
    mode: v.decision?.mode ?? '—',
    permanents,
    stack: v.state.stackSize,
    tags,
  };
});

/** A unique "kind" per decision for the 19-kinds index. */
export const DECISION_KINDS = (() => {
  const seen = new Map<string, number>();
  FIXTURES.forEach((v, i) => {
    if (!v.decision) return;
    const k = v.decision.kind ?? v.decision.id.split(':')[0];
    if (!seen.has(k)) seen.set(k, i);
  });
  return [...seen.entries()].map(([kind, index]) => ({ kind, index }));
})();
