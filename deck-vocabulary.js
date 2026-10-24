/* THE NEW DECK FLOW'S VOCABULARY (Rob, 2026-10-23: the Decks requirements' Q12, Q13, STF-5 to STF-8, GPL-3 to GPL-5).
 *
 * ONE LIST OF PLAY STYLES serves Start from's Choose play style and Define the Deck's Composition, so the two can't drift
 * apart (Q12). It is the strategy vocabulary (crankmagic-strategies.js, 16 strategies already read off 2,746 commanders in
 * data/commander-strategies.json) shown under the names players use -- sacrifice supply and death payoff are Aristocrats,
 * a blink loop and an enter-the-battlefield payoff are Blink -- plus the archetypes it lacks: Walls and Defenders,
 * Voltron, Superfriends and Go wide, which `commander` reads off the commander's own classified terms.
 *
 * ONE LIST OF MECHANICS serves Start from's Choose mechanics and Define the Deck's Mechanics (Q13): the graph's mechanic
 * terms on at least 50 cards, less the ones that are not a choice a player makes (enters tapped, a tap ability), named
 * the way players say them, plus the roles a player asks for by name (blink, sacrifice outlet ...).
 *
 * Every test reads a graph card (data/graph.json: ci, roles, mechanics, causes, triggers, produces, wants, grants,
 * extends, type, rank). PURE and UMD, like crankmagic-strategies.js. No model call anywhere (REC-3). */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrankVocabulary = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const has = (list, terms) => Array.isArray(list) && list.some((t) => terms.includes(t));
  const some = (list) => Array.isArray(list) && list.length > 0;
  const typed = (c, word) => new RegExp(`\\b${word}\\b`, "i").test(String(c.type || ""));

  /* THE PLAY STYLES. `strategies` are the vocabulary's ids a commander may already carry; `commander` reads a commander
     that offers the style though no strategy says so; `card` is a card in the 99 that serves it, for the pool counts
     (GPL-4's fit, GPL-5's sub-option, MEC-4's flag) and for Auto-create's payoff slots. `sub` names the style's own
     sub-options: Tribal's are the tribes. */
  const ARCHETYPES = [
    {id: "aristocrats", label: "Aristocrats", strategies: ["sacrifice-supply", "death-payoff"],
     card: (c) => has(c.roles, ["sac-outlet"]) || has(c.triggers, ["creature-dies", "sacrifice"]) || has(c.causes, ["sacrifice"])},
    {id: "blink", label: "Blink", strategies: ["blink-loop", "etb-payoff"],
     card: (c) => has(c.roles, ["blink"]) || has(c.triggers, ["creature-etb"])},
    {id: "tribal", label: "Tribal", strategies: ["tribal-payoff"], sub: "tribe",
     card: (c) => some(c.wants) || some(c.makes)},
    {id: "counters", label: "+1/+1 counters", strategies: ["counters"],
     card: (c) => has(c.roles, ["counters"]) || has(c.produces, ["counter"]) || has(c.mechanics, ["proliferate"]) || has(c.multiplies, ["counter"])},
    {id: "spellslinger", label: "Spellslinger", strategies: ["spellslinger"],
     card: (c) => has(c.triggers, ["cast-instant-sorcery", "cast-spell"]) || has(c.roles, ["instants"])},
    {id: "landfall", label: "Landfall", strategies: ["landfall"],
     card: (c) => has(c.triggers, ["land-drop"]) || has(c.mechanics, ["landfall"]) || has(c.roles, ["lands"])},
    {id: "reanimator", label: "Reanimator", strategies: ["recursion-loop"],
     card: (c) => has(c.roles, ["recursion", "graveyard"]) || has(c.triggers, ["graveyard-entry"])},
    {id: "untap", label: "Untap engines", strategies: ["untap-loop"],
     card: (c) => has(c.roles, ["untap"])},
    {id: "clones", label: "Clones and copies", strategies: ["copy-loop"],
     card: (c) => has(c.roles, ["copy"])},
    {id: "anthems", label: "Anthems", strategies: ["team-quality"],
     card: (c) => some(c.grants) || some(c.extends)},
    {id: "big-stats", label: "Power matters", strategies: ["stat-payoff"],
     card: (c) => some(c.wantsStat) || some(c.offersStat)},
    {id: "toolbox", label: "Toolbox", strategies: ["tutor-chain"],
     card: (c) => has(c.roles, ["tutor"])},
    {id: "extra-turns", label: "Extra turns", strategies: ["extra-turns"],
     card: (c) => has(c.roles, ["extra-turn"])},
    {id: "wheels", label: "Wheels and draw", strategies: ["draw-payoff"],
     card: (c) => has(c.triggers, ["draw-card"]) || has(c.roles, ["draw"])},
    {id: "walls", label: "Walls and Defenders", strategies: [],
     commander: (c) => has(c.mechanics, ["defender"]) || has(c.wantsStat, ["toughness"]),
     card: (c) => has(c.mechanics, ["defender"]) || has(c.wantsStat, ["toughness"])},
    {id: "voltron", label: "Voltron", strategies: [],
     commander: (c) => has(c.mechanics, ["equip", "enchant"]) || (has(c.mechanics, ["double strike", "hexproof"]) && /Creature/.test(String(c.type || ""))),
     card: (c) => has(c.mechanics, ["equip", "enchant"]) || (has(c.roles, ["protection"]) && !has(c.roles, ["wipe"]))},
    {id: "superfriends", label: "Superfriends", strategies: [],
     commander: (c) => typed(c, "Planeswalker") || has(c.mechanics, ["proliferate"]),
     card: (c) => typed(c, "Planeswalker") || has(c.mechanics, ["proliferate"])},
    {id: "go-wide", label: "Go wide", strategies: [],
     commander: (c) => has(c.produces, ["token"]),
     card: (c) => has(c.produces, ["token"]) || some(c.grants)}];
  const archetype = (id) => ARCHETYPES.find((a) => a.id === id) || null;

  /* THE MECHANICS (Q13). Graph terms on at least 50 cards, with the display names players use; DROP is what is not a
     choice (a card entering tapped is a fact about it, not a plan). ROLE_MECHANICS are the roles asked for by name. */
  const MIN_CARDS = 50;
  const DROP = new Set(["tap-ability", "enters-untapped", "enters-tapped", "enters-tapped-unless", "partner", "partner with", "devoid", "double", "transform", "landwalk", "typecycling", "landcycling", "cumulative upkeep", "echo", "regenerate", "protection", "morph", "manifest", "suspend", "changeling"]);
  const ALIAS = {"first strike": "First strike", "double strike": "Double strike", "treasure": "Treasure", "food": "Food", "investigate": "Clues (investigate)", "mill": "Mill", "equip": "Equipment", "enchant": "Auras", "crew": "Vehicles (crew)", "goad": "Goad", "amass": "Amass", "explore": "Explore", "connive": "Connive", "foretell": "Foretell", "madness": "Madness", "unearth": "Unearth", "domain": "Domain", "delirium": "Delirium", "threshold": "Threshold", "affinity": "Affinity", "convoke": "Convoke", "prowess": "Prowess", "kicker": "Kicker", "flashback": "Flashback", "cycling": "Cycling", "scry": "Scry", "surveil": "Surveil", "ward": "Ward", "landfall": "Landfall", "proliferate": "Proliferate", "fight": "Fight", "indestructible": "Indestructible", "hexproof": "Hexproof"};
  const ROLE_MECHANICS = [["blink", "Blink"], ["sac-outlet", "Sacrifice outlet"], ["counters", "+1/+1 counters"], ["copy", "Copy"], ["untap", "Untap"], ["recursion", "Recursion"], ["tutor", "Tutors"], ["extra-turn", "Extra turns"], ["graveyard", "Graveyard"], ["artifacts", "Artifacts"], ["lands", "Lands matter"], ["draw", "Card draw"], ["cost-reduction", "Cost reduction"]];
  const label = (term) => ALIAS[term] || term.charAt(0).toUpperCase() + term.slice(1);
  function mechanics(cards, min = MIN_CARDS) {
    const count = new Map(), roles = new Map();
    for (const c of cards) {
      for (const m of c.mechanics || []) count.set(m, (count.get(m) || 0) + 1);
      for (const r of c.roles || []) roles.set(r, (roles.get(r) || 0) + 1);
    }
    const terms = [...count].filter(([m, n]) => n >= min && !DROP.has(m)).map(([m, n]) => ({id: "m:" + m, term: m, kind: "mechanic", label: label(m), cards: n}));
    const named = ROLE_MECHANICS.filter(([r]) => (roles.get(r) || 0) >= min).map(([r, l]) => ({id: "r:" + r, term: r, kind: "role", label: l, cards: roles.get(r)}));
    return [...terms, ...named].sort((a, b) => a.label.localeCompare(b.label, "en-US"));
  }
  /* Whether a card carries or rewards a mechanic (MEC-3's bar counts these). */
  const carries = (c, id) => id.startsWith("r:") ? has(c.roles, [id.slice(2)]) : has(c.mechanics, [id.slice(2)]);

  /* COLORS. A color identity is the graph's ci string, sorted letters ("BGUW"), colorless "". */
  const COLORS = ["W", "U", "B", "R", "G"];
  const ciSet = (ci) => new Set(String(ci || "").toUpperCase().split("").filter((x) => COLORS.includes(x)));
  const within = (cardCi, identity) => [...ciSet(cardCi)].every((x) => identity.has(x));
  /* STF-5, Q10, Q11: exact identity, or commanders that include the picked colors; C alone is colorless. */
  function colorsMatch(ci, picked, {include = false, colorless = false} = {}) {
    const mine = ciSet(ci);
    if (colorless) return mine.size === 0;
    if (!picked.length) return true;
    const want = new Set(picked);
    if (include) return [...want].every((x) => mine.has(x));
    return mine.size === want.size && [...want].every((x) => mine.has(x));
  }

  /* A COMMANDER'S PLAY STYLES: the strategies it already carries (commander-strategies.json), named, plus the new
     archetypes its own terms offer. */
  function commanderStyles(card, strategies = []) {
    const out = [];
    for (const a of ARCHETYPES) if (a.strategies.some((s) => strategies.includes(s)) || (a.commander && a.commander(card))) out.push(a.id);
    return out;
  }
  /* A COMMANDER'S MECHANICS: the listed ones its own card carries (REC-1 writes these into the definition). */
  const commanderMechanics = (card, list) => list.filter((m) => carries(card, m.id)).map((m) => m.id);

  /* THE MATCHING LIST (STF-5 to STF-8): commanders that meet every pick, owned first, then by popularity (EDHREC rank),
     each with how many of the picked styles or mechanics it meets. `owned` is a set of commander names in hand. */
  function matchCommanders(index, picks = {}, owned = new Set()) {
    const {colors = [], include = false, colorless = false, styles = [], mechanics: wants = []} = picks;
    const rows = [];
    for (const c of index) {
      if (!colorsMatch(c.ci, colors, {include, colorless})) continue;
      const s = styles.filter((x) => (c.styles || []).includes(x)).length, m = wants.filter((x) => (c.mechanics || []).includes(x)).length;
      if (styles.length && !s) continue;
      if (wants.length && !m) continue;
      rows.push({...c, owned: owned.has(c.name), matches: s + m});
    }
    return rows.sort((a, b) => (b.owned - a.owned) || (b.matches - a.matches) || ((a.rank || 1e9) - (b.rank || 1e9)) || a.name.localeCompare(b.name, "en-US"));
  }

  /* THE POOL AROUND A COMMANDER: the cards inside its color identity, less commanders' own copy. GPL-4: a style fits when
     enough of the pool serves it. GPL-5: "Let CrankMagic choose" picks the sub-option with the most cards. MEC-4: a
     mechanic is flagged below FLAG cards after every filter. */
  const FIT_MIN = 24, FLAG = 16, BAR = 8, MAX_MECHANICS = 3;
  const poolOf = (cards, identity, keep = () => true) => cards.filter((c) => !c.isLand && within(c.ci, identity) && keep(c));
  function fits(cards, identity, keep) {
    const pool = poolOf(cards, identity, keep);
    return ARCHETYPES.map((a) => ({id: a.id, label: a.label, cards: pool.filter(a.card).length})).map((x) => ({...x, fits: x.cards >= FIT_MIN}));
  }
  /* A tribe's cards: its bodies, and its payoffs counted twice (a lord is worth more to the plan than one more body). */
  function tribes(cards, identity, keep) {
    const pool = poolOf(cards, identity, keep), count = new Map();
    for (const c of pool) {for (const t of c.tribes || []) count.set(t, (count.get(t) || 0) + 1);for (const t of c.wants || []) count.set(t, (count.get(t) || 0) + 2);}
    return [...count].filter(([, n]) => n >= FIT_MIN).map(([id, n]) => ({id, label: id, cards: n})).sort((a, b) => b.cards - a.cards || a.id.localeCompare(b.id, "en-US"));
  }
  /* LET CRANKMAGIC CHOOSE (GPL-5): of the tribes the pool can carry, the ones the commander is, wants or makes come first,
     then the most cards. */
  function chooseTribe(cards, identity, commanders = [], keep) {
    const near = (t) => commanders.reduce((n, c) => n + ((c.wants || []).includes(t) ? 3 : 0) + ((c.makes || []).includes(t) ? 2 : 0) + ((c.tribes || []).includes(t) ? 1 : 0), 0);
    const list = tribes(cards, identity, keep).map((x) => ({...x, near: near(x.id)}));
    return list.sort((a, b) => b.near - a.near || b.cards - a.cards || a.id.localeCompare(b.id, "en-US"))[0] || null;
  }
  function mechanicCounts(cards, identity, ids, keep) {
    const pool = poolOf(cards, identity, keep);
    return ids.map((id) => {const n = pool.filter((c) => carries(c, id)).length; return {id, cards: n, flagged: n < FLAG};});
  }
  return {ARCHETYPES, archetype, MIN_CARDS, DROP, ALIAS, ROLE_MECHANICS, mechanics, carries, label, COLORS, ciSet, within, colorsMatch,
    commanderStyles, commanderMechanics, matchCommanders, FIT_MIN, FLAG, BAR, MAX_MECHANICS, poolOf, fits, tribes, chooseTribe, mechanicCounts};
});
