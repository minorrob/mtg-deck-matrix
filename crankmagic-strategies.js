/* THE STRATEGY VOCABULARY: what a Commander deck is trying to do, as queries over the graph's
 * own terms.
 *
 * T0 of docs/crankmagic-strategy-trace-plan.md. A strategy is not prose: it is a small tuple
 * that says (1) which COMMANDER offers it, read off the commander's classified terms, and (2)
 * which JOIN between two cards serves it, read off the relation the graph already computes
 * (crankmagic-graph.js relateTerms). Because both halves are queries, the same sixteen
 * definitions cover every legal commander in the graph on day one, and the Trace walk can ask
 * "does this join advance one of the deck's strategies" without a list of card names.
 *
 * Three sources, in the order the plan gives them: derived from the commander's rules text
 * (`derive`), the deck's own mechanics labels (`fromMechanics`, the six live decks and anything
 * a reader ticks), and a guide's archetype words (`fromWords`). tools/commander-strategies.mjs
 * bakes the derived set into data/commander-strategies.json; the deck definition keeps what the
 * reader ticked as `definition.strategies`.
 *
 * PURE and UMD like crankmagic-loops.js: Node tests hold it on the committed graph. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrankStrategies = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const has = (list, terms) => Array.isArray(list) && list.some((t) => terms.includes(t));
  const hit = (list, terms) => Array.isArray(list) && list.some((t) => terms.includes(t));
  const some = (list) => Array.isArray(list) && list.length > 0;

  /* The tuples. `commander(c)` reads a classified card (roles, mechanics, causes, triggers,
     produces, grants, extends, wants, wantsStat); `join(r)` reads a relation from
     CrankGraph.relate / relation(). `ring` says where the strategy's pieces tend to land in a
     trace (1 engines, 2 closers, 3 payoffs) -- a hint for the pane's grouping, not a rule. */
  const STRATEGIES = [
    {id: "untap-loop", label: "Untap loop", why: "an untap engine onto a tap ability worth another go",
     commander: (c) => has(c.mechanics, ["tap-ability"]) || has(c.roles, ["untap"]),
     join: (r) => hit(r.drives, ["untap"]) || hit(r.drivenBy, ["untap"])},
    {id: "copy-loop", label: "Copy loop", why: "a copier onto a permanent worth copying again",
     commander: (c) => has(c.roles, ["copy"]) || (has(c.mechanics, ["tap-ability"]) && (has(c.produces, ["token"]) || has(c.causes, ["creature-etb"]))),
     join: (r) => hit(r.drives, ["copy"]) || hit(r.drivenBy, ["copy"])},
    {id: "blink-loop", label: "Blink loop", why: "a blink engine onto a permanent that enters for value",
     commander: (c) => has(c.roles, ["blink"]) || has(c.triggers, ["creature-etb"]),
     join: (r) => hit(r.drives, ["blink"]) || hit(r.drivenBy, ["blink"])},
    {id: "sacrifice-supply", label: "Sacrifice supply", why: "bodies made repeatably into an outlet that wants them",
     commander: (c) => has(c.roles, ["sac-outlet"]) || has(c.produces, ["token"]),
     join: (r) => hit(r.loopFeeds, ["creatures"]) || hit(r.loopFed, ["creatures"]) || hit(r.fires, ["sacrifice"]) || hit(r.firedBy, ["sacrifice"])},
    {id: "etb-payoff", label: "Enter-the-battlefield payoff", why: "a card that fires when a creature enters, fed by cards that make them enter",
     commander: (c) => has(c.causes, ["creature-etb"]) || has(c.triggers, ["creature-etb"]),
     join: (r) => hit(r.fires, ["creature-etb"]) || hit(r.firedBy, ["creature-etb"])},
    {id: "death-payoff", label: "Death payoff", why: "a card that fires when a creature dies, fed by the cards that kill your own",
     commander: (c) => has(c.causes, ["creature-dies", "sacrifice"]) || has(c.triggers, ["creature-dies", "sacrifice"]),
     join: (r) => hit(r.fires, ["creature-dies"]) || hit(r.firedBy, ["creature-dies"])},
    {id: "counters", label: "Counters and proliferate", why: "+1/+1 counters placed, doubled and proliferated",
     commander: (c) => has(c.causes, ["counter-placed", "proliferate"]) || has(c.triggers, ["counter-placed", "proliferate"]) || has(c.roles, ["counters"]) || has(c.produces, ["counter"]) || has(c.mechanics, ["proliferate"]) || has(c.multiplies, ["counter"]),
     join: (r) => hit(r.fires, ["counter-placed", "proliferate"]) || hit(r.firedBy, ["counter-placed", "proliferate"]) || hit(r.multiplied, ["counter"]) || hit(r.multiplies, ["counter"]) || hit(r.loopFeeds, ["counters"]) || hit(r.loopFed, ["counters"])},
    {id: "team-quality", label: "Team quality", why: "a quality granted to one permanent and spread across the board",
     commander: (c) => some(c.grants) || some(c.extends),
     join: (r) => some(r.extended) || some(r.extendedBy)},
    {id: "tribal-payoff", label: "Tribal payoff", why: "a lord or payoff that names the tribe, and the bodies that are it",
     commander: (c) => some(c.wants),
     join: (r) => some(r.tribal) || some(r.tribalBy)},
    {id: "stat-payoff", label: "Stat payoff", why: "a card that rewards a printed number, and the bodies that carry it",
     commander: (c) => some(c.wantsStat),
     join: (r) => some(r.statted) || some(r.stattedBy)},
    {id: "tutor-chain", label: "Tutor chain", why: "finders that fetch the next piece",
     commander: (c) => has(c.roles, ["tutor"]),
     join: (r) => hit(r.shared, ["tutor"])},
    {id: "recursion-loop", label: "Recursion loop", why: "the graveyard filled and brought back, again",
     commander: (c) => has(c.roles, ["recursion"]) || has(c.causes, ["graveyard-entry"]) || has(c.triggers, ["graveyard-entry"]),
     join: (r) => hit(r.fires, ["graveyard-entry"]) || hit(r.firedBy, ["graveyard-entry"]) || hit(r.loopFeeds, ["graveyard"]) || hit(r.loopFed, ["graveyard"])},
    {id: "extra-turns", label: "Extra turns", why: "turns taken again, and the cards that find or copy them",
     commander: (c) => has(c.roles, ["extra-turn"]),
     join: (r) => hit(r.shared, ["extra-turn"])},
    {id: "draw-payoff", label: "Draw payoff", why: "a card that fires on a draw, fed by the cards that draw",
     commander: (c) => has(c.triggers, ["draw-card"]) || has(c.causes, ["draw-card"]),
     join: (r) => hit(r.fires, ["draw-card"]) || hit(r.firedBy, ["draw-card"])},
    {id: "landfall", label: "Landfall", why: "a land drop as the event, and the cards that make more of them",
     commander: (c) => has(c.triggers, ["land-drop"]),
     join: (r) => hit(r.fires, ["land-drop"]) || hit(r.firedBy, ["land-drop"])},
    {id: "spellslinger", label: "Spells cast", why: "an instant or sorcery cast as the event",
     commander: (c) => has(c.triggers, ["cast-instant-sorcery", "cast-spell"]),
     join: (r) => hit(r.fires, ["cast-instant-sorcery", "cast-spell"]) || hit(r.firedBy, ["cast-instant-sorcery", "cast-spell"])}
  ];
  const byId = new Map(STRATEGIES.map((s) => [s.id, s]));
  const ids = () => STRATEGIES.map((s) => s.id);
  const labelOf = (id) => (byId.get(id) ? byId.get(id).label : String(id));

  /* Source 1: what a commander's own text offers. */
  function derive(card) {
    if (!card) return [];
    return STRATEGIES.filter((s) => { try { return Boolean(s.commander(card)); } catch { return false; } }).map((s) => s.id);
  }
  /* The strategies a join advances, in the vocabulary's order. */
  function servedBy(relation) {
    if (!relation) return [];
    return STRATEGIES.filter((s) => { try { return Boolean(s.join(relation)); } catch { return false; } }).map((s) => s.id);
  }

  /* Source 3a: the deck's mechanics labels (definition.mechanics, the Lab's tick list). */
  const MECHANIC_LABELS = {
    "tokens": ["sacrifice-supply", "etb-payoff"], "etb triggers": ["etb-payoff", "blink-loop"], "graveyard": ["recursion-loop"],
    "landfall": ["landfall"], "draw": ["draw-payoff"], "counters": ["counters"], "proliferate": ["counters"],
    "doublers & multipliers": ["counters", "etb-payoff"], "defender": ["stat-payoff"], "combat": ["stat-payoff", "team-quality"],
    "sacrifice": ["sacrifice-supply", "death-payoff"], "drain & burn": ["death-payoff", "etb-payoff"], "aristocrats": ["sacrifice-supply", "death-payoff"],
    "blink": ["blink-loop", "etb-payoff"], "untap": ["untap-loop"], "copy": ["copy-loop"], "tutors": ["tutor-chain"], "extra turns": ["extra-turns"],
    "spellslinger": ["spellslinger"], "spells": ["spellslinger"], "ninjutsu": ["stat-payoff"], "tribal": ["tribal-payoff", "team-quality"]
  };
  function fromMechanics(labels) {
    const out = [];
    for (const raw of labels || []) {
      const key = String(raw || "").toLowerCase().trim();
      const hits = MECHANIC_LABELS[key] || (key.endsWith(" tribal") ? MECHANIC_LABELS.tribal : []);
      for (const id of hits) if (!out.includes(id)) out.push(id);
    }
    return out;
  }
  /* Source 3b: free words -- a guide's archetype line, a definition's restrictions. */
  function fromWords(text) {
    const t = String(text || "").toLowerCase();
    const found = [];
    for (const [key, hits] of Object.entries(MECHANIC_LABELS)) if (key.length > 3 && t.includes(key)) for (const id of hits) if (!found.includes(id)) found.push(id);
    if (/\btribal\b/.test(t)) for (const id of MECHANIC_LABELS.tribal) if (!found.includes(id)) found.push(id);
    return found;
  }

  /* THE DECK'S DEFAULT: what the reader ticked if anything; otherwise the commander's own
     strategies together with the ones the deck's mechanics name -- the union, because the
     plan's intersection left a landfall deck under a commander who does not say "land" with
     nothing to trace. A strategy no join in the hundred serves lights nothing and costs
     nothing; the pane lets the reader untick. Always in the vocabulary's order. */
  function forDeck({commanderStrategies = [], mechanics = [], ticked = null} = {}) {
    const order = ids();
    const sort = (list) => order.filter((id) => list.includes(id));
    if (Array.isArray(ticked) && ticked.length) return sort(ticked);
    const named = fromMechanics(mechanics);
    return sort([...commanderStrategies, ...named]);
  }

  return {STRATEGIES, ids, labelOf, derive, servedBy, fromMechanics, fromWords, forDeck, MECHANIC_LABELS};
});
