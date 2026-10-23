/* COMMANDER-DRIVEN RECOMMENDATIONS (Rob, 2026-10-23: the Decks requirements' REC-1 to REC-6).
 *
 * Assigning a commander writes its key mechanics and play styles into the deck's definition, marked as from the commander
 * (`fromCommander`, REC-1); it never fills the 99 (REC-4). Recommendations are the graph model's own relations, scored
 * against the definition (REC-2), each card saying which relation put it there:
 *
 *   synergy   CrankGraph.relate between a commander and the card: what one makes, causes or grants the other wants
 *   chain     a loop edge over that relation (CrankLoops.edgesOf): a reset, a feed or a firing a cycle runs on
 *   style     the card serves one of the deck's play styles (deck-vocabulary.js)
 *   mechanic  the card carries one of the deck's chosen mechanics
 *
 * No AI (REC-3): the same commander, definition and pool give the same list every time -- every sort ends on the name.
 * They recompute whenever the commander or the definition changes (REC-6), because they are a function of both. Auto-create
 * reads them (deck-autocreate.js) and the Library scoped to a deck sorts by them (REC-5). PURE and UMD. */
(function (root, factory) {
  const isNode = typeof module === "object" && module.exports && typeof require === "function";
  const V = isNode ? require("./deck-vocabulary.js") : root && root.CrankVocabulary;
  const api = factory(V);
  if (isNode) module.exports = api;
  if (root) root.CrankRecommend = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (V) {
  "use strict";
  if (!V) throw new Error("Recommendations need deck-vocabulary.js");
  const identityOf = (commanders) => new Set(commanders.flatMap((c) => [...V.ciSet(c.ci)]));

  /* REC-1: what the commander brings to the definition. `index` is data/commander-index.json's lists. */
  function fromCommander(commanders, {styles = [], mechanics = []} = {}, strategiesOf = () => []) {
    const ids = new Set(styles.map((s) => s.id)), mIds = new Set(mechanics.map((m) => m.id));
    const st = [...new Set(commanders.flatMap((c) => V.commanderStyles(c, strategiesOf(c.name))))].filter((x) => !ids.size || ids.has(x));
    const me = [...new Set(commanders.flatMap((c) => V.commanderMechanics(c, mechanics)))].filter((x) => !mIds.size || mIds.has(x));
    return {styles: st, mechanics: me};
  }

  /* REC-2: the recommendations. `definition` carries `styles` (Composition, primary first) and `mechanics` (ids);
     `relate` is CrankGraph.relate and `loops` CrankLoops, either optional. Returns cards sorted best first, each with
     its score and the relations that put it there. */
  function recommend({commanders, definition = {}, pool, relate = null, loops = null, limit = 400}) {
    const identity = identityOf(commanders), names = new Set(commanders.map((c) => c.name));
    const styles = (definition.styles || []).map(V.archetype).filter(Boolean), mechanics = definition.mechanics || [];
    const out = [];
    for (const c of pool) {
      if (!c || names.has(c.name) || c.isLand || !V.within(c.ci, identity)) continue;
      const why = [];let score = 0;
      for (const lead of commanders) {
        const r = relate ? relate(lead, c) || relate(c, lead) : null;
        if (r && r.score) {score += Math.min(6, r.score / 3);why.push({kind: "synergy", with: lead.name, says: r.reason || r.tag || "related"});
          const edges = loops && loops.edgesOf ? loops.edgesOf(r) : [];
          if (edges.length) {score += 3;why.push({kind: "chain", with: lead.name, says: edges[0].says || edges[0].kind || "a loop edge"});}}
      }
      styles.forEach((a, i) => {if (a.card(c)) {score += i === 0 ? 3 : 1.5;why.push({kind: "style", style: a.id, says: `serves ${a.label}`});}});
      for (const m of mechanics) if (V.carries(c, m)) {score += 2;why.push({kind: "mechanic", mechanic: m, says: `carries ${V.label(m.slice(2))}`});}
      if (!why.length) continue;
      /* Popularity breaks near-ties toward what is played, never past a real relation. */
      score += Number.isFinite(c.rank) ? Math.max(0, 1 - c.rank / 20000) : 0;
      out.push({name: c.name, score: Math.round(score * 100) / 100, why});
    }
    return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "en-US")).slice(0, limit);
  }
  return {identityOf, fromCommander, recommend};
});
