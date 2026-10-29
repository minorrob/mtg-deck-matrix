/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Pure parts of --pool dealing: the compiler's universe, estimated sentence reuse and theme-sized lanes. */
import {deckCard, nextSentences} from "../game/tools/card-compiler.mjs";

/** A frozen loading target limits writing and promotion lanes, never the verification universe. */
export function loadScopeFilter(scope, canonicalName = (name) => name) {
  if (scope === null) return () => true;
  if (scope?.schema !== "CrankCardLoadScope@1" || scope.share !== 0.95 || !Array.isArray(scope.cards)
    || scope.count !== scope.cards.length || !scope.cards.length
    || scope.cards.some((c) => typeof c.name !== "string" || !c.name.trim())
    || new Set(scope.cards.map((c) => c.name)).size !== scope.cards.length)
    throw new Error("Use a valid frozen 95%-appearance scope manifest");
  const names = new Set(scope.cards.filter((c) => !c.exempt).map((c) => c.name));
  return (name) => names.has(canonicalName(name));
}

export function commanderPool(oracle, banned, defined) {
  const seen = new Set();
  return oracle.cards.filter((card) => {
    if (!deckCard(card) || banned.has(card.name) || defined(card.name) || seen.has(card.name)) return false;
    seen.add(card.name);
    return true;
  });
}

/* This estimates completions from the current one-gap cards; only a post-wave compiler run measures actual gains. */
export function scorePool(cards) {
  const reuse = new Map(nextSentences(cards.map((c) => ({status: c.compiler, gaps: c.gaps})), Infinity)
    .map(({sentence, cards: count}) => [sentence, count]));
  return cards.map((card) => {
    const gaps = [...new Set((card.gaps ?? []).map((gap) => gap.replace(/\s+/g, " ").trim()))];
    const potentialCompletions = gaps.reduce((total, gap) => total + (reuse.get(gap) ?? 0), 0);
    return {...card, sentencesNeeded: card.gaps?.length ?? null, potentialCompletions,
      potentialPerSentence: gaps.length ? potentialCompletions / gaps.length : 0};
  });
}

const compare = (a, b) => Number(b.tier === "candidate") - Number(a.tier === "candidate")
  || b.potentialPerSentence - a.potentialPerSentence || b.potentialCompletions - a.potentialCompletions
  || (a.sentencesNeeded ?? Infinity) - (b.sentencesNeeded ?? Infinity) || (a.rank ?? Infinity) - (b.rank ?? Infinity)
  || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export function dealPoolLanes(cards, {laneSize = 30, themes, themeOf, rides = {}}) {
  if (!Number.isInteger(laneSize) || laneSize < 1) throw new Error("The lane size must be a positive whole number");
  const labels = new Map(themes.map(([id, label]) => [id, label]));
  const hostOf = (id, seen = new Set()) => {
    if (!labels.has(id)) throw new Error(`Unknown pool theme: ${id}`);
    if (seen.has(id)) throw new Error(`Theme rides form a cycle at ${id}`);
    return rides[id] ? hostOf(rides[id], new Set([...seen, id])) : id;
  };
  for (const id of Object.keys(rides)) hostOf(id);
  const groups = new Map(themes.map(([id]) => [id, []]));
  for (const card of cards) groups.get(hostOf(themeOf(card))).push(card);
  const lanes = [];
  for (const [theme] of themes) {
    const rows = groups.get(theme).sort(compare);
    const label = themes.filter(([id]) => hostOf(id) === theme).map(([, text]) => text).join("; ");
    const parts = Math.ceil(rows.length / laneSize);
    for (let part = 0; part < parts; part++) {
      const slice = rows.slice(part * laneSize, (part + 1) * laneSize);
      lanes.push({theme, label, part: parts > 1 ? part + 1 : 0,
        cards: slice.filter((card) => card.tier !== "candidate"), review: slice.filter((card) => card.tier === "candidate")});
    }
  }
  lanes.forEach((lane, i) => { lane.id = `L${i + 1}-${lane.theme}${lane.part ? "-" + lane.part : ""}`; });
  return lanes;
}
