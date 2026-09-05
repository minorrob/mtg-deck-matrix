/**
 * Slot model - the one projection the Deck page and the Shop page both read.
 *
 * A deck is ~100 slots. Each slot is a ladder of candidates chained by `replaces`,
 * which lineup-model.js already resolves into slot groups. This module turns those
 * groups into the row shape the UI renders, collapses the twelve storage array keys
 * down to the five rungs a person actually sees, and owns the two vocabularies that
 * were previously duplicated across the four pages: price bands and ownership state.
 *
 * Pure. No DOM, no storage, no fetch.
 */
(function (root, factory) {
  "use strict";
  const lineup = (typeof module === "object" && module.exports && typeof require === "function")
    ? require("./lineup-model.js")
    : root && root.MtgLineupModel;
  const api = factory(lineup);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgSlotModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Lineup) {
  "use strict";

  if (!Lineup) throw new Error("Slot model requires the lineup model");

  /* ---------------- rungs ----------------
   * Twelve storage keys, five rungs on screen. The -2 ladders fold into their parent
   * rung exactly as the Calibrate page already labels them, so nothing new is invented
   * here; this is the single place that mapping now lives.
   */
  const RUNG_ORDER = ["base", "tuned", "enhance", "fun", "max", "manual"];
  const RUNG_BY_KIND = {
    shell: "base",
    tuned: "tuned", required: "tuned", tuned2: "tuned",
    upgrade: "enhance", enhance: "enhance",
    max: "max", enhance2: "max", max2: "max",
    funTuned: "fun", funMax: "fun",
    altTuned: "alt", altMax: "alt",
    // Hand-added: a Salvage pull or a pasted TCGplayer link. Sorted last on a slot because
    // it is the owner's own answer, offered after every measured one.
    manual: "manual",
    transfer: "transfer"
  };
  const RUNG_LABEL = {base: "Base", tuned: "Tuned", enhance: "Enhance", fun: "Fun", max: "Max", alt: "Alt", manual: "Manual", transfer: "Borrowed"};
  function rungOf(kind) { return RUNG_BY_KIND[kind] || "base"; }

  /* ---------------- the four measured builds ----------------
   * Five rungs appear on a slot, but only four of them are whole-deck builds that
   * the simulation ever measured, and data/rung-lists.json pins exactly those four.
   * Enhance is deliberately absent: it is a set of optional per-slot substitutions
   * layered on Tuned, not a hundred anyone ran games with.
   *
   * The chains are NOT cumulative in the obvious way. Max layers on Tuned, but Fun
   * branches straight off Base -- it is the same deck asked a different question,
   * not Tuned with jokes added. These are the same chains tests/lineup-compliance.mjs
   * composes against the pinned lists, which is what makes "apply this rung" and
   * "the hundred we measured" the same thing.
   */
  const BUILD_RUNGS = ["base", "tuned", "fun", "max"];
  const RUNG_CHAIN = {
    base: [],
    tuned: ["required", "tuned2"],
    fun: ["funTuned"],
    max: ["required", "tuned2", "upgrade", "enhance", "enhance2", "max", "max2"]
  };

  /* Compare ranks variants on three stages; the Deck page offers four rungs. Maxed
     lands on max and Base on base. Compare has no Fun stage, so everything else is
     Tuned -- which is also what an unseeded deck would already have defaulted to. */
  function rungForStage(stage) {
    const n = Number(stage) || 2;
    return n === 1 ? "base" : n === 3 ? "max" : "tuned";
  }

  /**
   * The selection that IS this rung, for every slot at once, regardless of whether
   * a single card has been bought. ownedOptional and capabilityOption items are
   * offers layered on top of a finished rung, never part of the rung itself, so
   * they are excluded here exactly as lib.mjs and the compliance test exclude them.
   */
  function selectionForRung(plan, rung) {
    let selection = Lineup.canonicalizeSelection(plan, Object.assign(Lineup.emptySelection(), {
      shell: (plan.startingShell || []).map((item) => String(item.id))
    }));
    (RUNG_CHAIN[rung] || []).forEach((bucket) => {
      (plan[bucket] || [])
        .filter((item) => !item.ownedOptional && !item.capabilityOption)
        .forEach((item) => { selection = Lineup.applyChoice(plan, selection, item.id); });
    });
    return selection;
  }

  /* Composing a rung walks applyChoice once per item and each call rebuilds the
     lineup model, so the four signatures cost ~40ms together -- once per render, on
     every pick, which is felt. Plans are stable objects for the life of the page,
     so the answer is cached against the plan itself. */
  const signatureCache = new WeakMap();
  function rungSignatures(plan) {
    let cached = signatureCache.get(plan);
    if (!cached) {
      cached = {};
      BUILD_RUNGS.forEach((rung) => { cached[rung] = selectionSignature(selectionForRung(plan, rung)); });
      signatureCache.set(plan, cached);
    }
    return cached;
  }

  /* Which other whole-deck builds are literally the same hundred as this one. Today
     Max collapses onto Tuned for most variants, because their Tier 3 cards are filed
     as offers rather than as the rung. The UI says so out loud rather than letting
     the button look broken. */
  function rungTwins(plan, rung) {
    const signatures = rungSignatures(plan);
    return BUILD_RUNGS.filter((other) => other !== rung && signatures[other] === signatures[rung]);
  }

  /**
   * The measured rung this deck is closest to, and how far off it is.
   *
   * activeRung answers "is this deck exactly a rung", which is the right question
   * for the highlight and the wrong one for the reader who has changed three
   * cards and wants to know what their score used to describe. This answers that:
   * the rung sharing the most entries, and the count of entries that differ.
   *
   * `preferred` breaks ties toward the rung the reader last clicked, for the same
   * reason activeRung does -- two rungs are often the same hundred.
   */
  function nearestRung(plan, selection, preferred) {
    const mine = new Map();     // slotId -> entry id
    Lineup.selectedEntries(plan, selection).forEach((entry) => {
      if (entry.slotId) mine.set(entry.slotId, String(entry.id));
    });
    let best = null;
    BUILD_RUNGS.forEach((rung) => {
      const theirs = new Map();
      Lineup.selectedEntries(plan, selectionForRung(plan, rung)).forEach((entry) => {
        if (entry.slotId) theirs.set(entry.slotId, String(entry.id));
      });
      /* Counted in slots, not in cards. Swapping one card is one card out and one
         card in, and reporting that as "2 differences" reads as twice the edit
         somebody made. A slot the other rung does not have at all still counts
         once, which is why both directions are walked. */
      let differs = 0;
      theirs.forEach((id, slotId) => { if (mine.get(slotId) !== id) differs += 1; });
      mine.forEach((id, slotId) => { if (!theirs.has(slotId)) differs += 1; });
      const better = !best || differs < best.differs
        || (differs === best.differs && rung === preferred);
      if (better) best = {rung, differs, slots: theirs.size};
    });
    return best;
  }

  function selectionSignature(selection) {
    const ids = [];
    Lineup.ARRAY_KEYS.forEach((key) => {
      ((selection && selection[key]) || []).forEach((id) => ids.push(String(id)));
    });
    return ids.sort().join("|");
  }

  /**
   * Which rung the deck is currently standing on, or null once it has been hand
   * edited away from all four. Derived rather than remembered: a stored "you chose
   * Tuned" would keep claiming Tuned after a single slot was changed underneath it.
   *
   * `preferred` is the last rung the reader actually clicked. Two rungs can be the
   * same hundred -- Max and Tuned are, on most variants -- and in that case the
   * honest answer is the one they asked for, not whichever sorts first.
   */
  function activeRung(plan, selection, preferred) {
    const signature = selectionSignature(selection);
    const signatures = rungSignatures(plan);
    const matches = BUILD_RUNGS.filter((rung) => signatures[rung] === signature);
    if (!matches.length) return null;
    return matches.includes(preferred) ? preferred : matches[0];
  }

  /**
   * The ladder is a chain, not a five-way comparison. Base states the slot's job;
   * Tuned improves on Base's fit to the deck's strategy; Enhance improves on what
   * Tuned already fixed. Fun and Max are their own axes and answer to the slot,
   * not to the rung below them. So each heading names its actual predecessor.
   */
  /**
   * Which Scryfall image size to ask for.
   *
   * The catalog stores `small`, 146px wide, because that is what the import happened to
   * capture. The preview pane renders it at 286 CSS px on a desktop and 316 on a phone
   * -- 572 and 948 device pixels once the screen's own scaling is counted -- so it was
   * being blown up four to six times. The CSS has always declared aspect-ratio 488/680,
   * which is `normal`'s exact shape, so that is the size the layout was drawn for.
   *
   * Rewriting the URL rather than the data means a card added later -- a Salvage intake,
   * a manual card resolved from a link -- gets the same treatment without a migration.
   * Anything that is not a Scryfall card image is handed back untouched.
   */
  const SCRYFALL_SIZES = ["small", "normal", "large", "png", "art_crop", "border_crop"];
  function cardImage(url, size) {
    const raw = String(url || "");
    if (!raw || !SCRYFALL_SIZES.includes(size)) return raw;
    return raw.replace(/(cards\.scryfall\.io\/)(small|normal|large|png|art_crop|border_crop)(\/)/, `$1${size}$3`);
  }

  /* ---------------- mana ----------------
   * What a card costs and what it can pay for. Deliberately the same two rules
   * sim-engine uses -- tests/slot-model.mjs asserts the pair agree across the whole
   * catalog -- because a page that disagrees with the simulation about what a land
   * taps for is worse than a page with no mana readout at all.
   */
  const MANA_COLORS = ["W", "U", "B", "R", "G"];
  const BASIC_COLOR = {Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G"};

  function manaCostOf(manaCost) {
    const tokens = String(manaCost || "").match(/\{([^}]+)\}/g) || [];
    const pips = {W: 0, U: 0, B: 0, R: 0, G: 0};
    let generic = 0;
    let value = 0;
    tokens.forEach((token) => {
      const body = token.slice(1, -1).toUpperCase();
      if (/^\d+$/.test(body)) { generic += Number(body); value += Number(body); return; }
      if (body === "X" || body === "Y") return;
      const color = MANA_COLORS.find((entry) => body.includes(entry));
      if (color) pips[color] += 1; else generic += 1;
      value += 1;
    });
    return {pips, generic, value};
  }

  const BASIC_TYPE_COLOR = {plains: "W", island: "U", swamp: "B", mountain: "R", forest: "G"};
  const PUTS_LAND_ONTO_BATTLEFIELD = new RegExp(
    "search(?:es)? your library for [^.]{0,70}?(?:land|plains|island|swamp|mountain|forest)"
    + "[^.]{0,90}?onto the battlefield", "i");

  // A Treasure a card just makes is ramp; one behind a mana or sacrifice cost is
  // not ramp on cast. Kept identical to sim-engine's rule -- the suite compares
  // the two card for card.
  function makesTreasureFreely(text) {
    if (!/create a treasure token/.test(text)) return false;
    return String(text).split("\n").some((line) => {
      if (!/create a treasure token/.test(line)) return false;
      const colon = line.indexOf(":");
      if (colon < 0) return true;
      return !/\{\d|sacrifice|discard|pay/.test(line.slice(0, colon));
    });
  }

  function producesColors(card) {
    const text = String((card && card.oracleText) || "").toLowerCase();
    const typeLine = String((card && card.typeLine) || "");
    const produced = new Set();
    if (BASIC_COLOR[card && card.name]) produced.add(BASIC_COLOR[card.name]);
    // Every symbol in the run after "add", not just the first, so a dual or triome
    // gets credit for each color it actually taps for.
    (text.match(/add\s+(?:\{[wubrgc]\}\s*(?:(?:,|or\b|and\b)\s*)*)+/g) || []).forEach((run) => {
      (run.match(/\{([wubrgc])\}/g) || []).forEach((token) => {
        const color = token.replace(/[^wubrgc]/g, "").toUpperCase();
        if (MANA_COLORS.includes(color)) produced.add(color);
      });
    });
    if (/add one mana of any color|add \{c\}\{c\}|any color/.test(text)) MANA_COLORS.forEach((color) => produced.add(color));
    // A land that goes and gets a basic makes what that basic makes. These carry
    // an empty color identity, so the fallback below left Evolving Wilds and the
    // Panoramas producing nothing at all. Only a fetch that puts the land onto
    // the battlefield counts -- basic landcycling puts it in your hand, which is
    // card selection, not mana. Kept identical to sim-engine's rule on purpose;
    // the suite checks the two against each other over the whole catalog.
    if (/\bLand\b/.test(typeLine) && !produced.size && PUTS_LAND_ONTO_BATTLEFIELD.test(text)) {
      const named = text.match(/\b(plains|island|swamp|mountain|forest)\b/g) || [];
      if (named.length) {
        named.forEach((word) => produced.add(BASIC_TYPE_COLOR[word]));
      } else {
        MANA_COLORS.forEach((color) => produced.add(color));
      }
    }
    if (/\bLand\b/.test(typeLine) && !produced.size) ((card && card.colorIdentity) || []).forEach((color) => produced.add(String(color).toUpperCase()));
    return Array.from(produced);
  }

  /**
   * Whether a hundred can actually cast itself.
   *
   * Sources counts every card that taps for a color, lands and rocks alike, weighted by
   * how many copies the slot holds. Demand is the pips the deck's own spells ask for. The
   * ratio between them is the thing worth seeing at a table: eighteen green pips off nine
   * green sources is a deck that will sit in your hand.
   *
   * The floor is deliberately crude -- a color wants roughly a third of the deck's lands
   * behind it before the pips stop being a problem -- because a precise answer needs the
   * curve, and a crude answer you can check by eye beats a precise one you cannot.
   */
  function manaHealth(cards) {
    const sources = {W: 0, U: 0, B: 0, R: 0, G: 0};
    const pips = {W: 0, U: 0, B: 0, R: 0, G: 0};
    let lands = 0;
    let spells = 0;
    let totalValue = 0;
    (cards || []).forEach((card) => {
      const qty = Math.max(1, Number(card.quantity) || 1);
      const isLand = /\bLand\b/.test(String(card.typeLine || ""));
      if (isLand) lands += qty; else { spells += qty; }
      producesColors(card).forEach((color) => { sources[color] += qty; });
      if (!isLand && !card.isCommander) {
        const cost = manaCostOf(card.manaCost);
        MANA_COLORS.forEach((color) => { pips[color] += cost.pips[color] * qty; });
        totalValue += cost.value * qty;
      }
    });
    /* A color is thin when the deck asks more of it than it can pay for. A flat floor --
       a third of the lands, say -- misses the case that actually strands cards: deck 3
       asks thirty-four green pips off eighteen green sources and a flat rule calls that
       healthy. So the floor scales with how much of the deck's demand that color is. A
       color carrying sixty per cent of the pips wants roughly sixty per cent of the lands
       behind it; the 0.9 is slack for rocks and fixing that a pip count cannot see. */
    const totalPips = MANA_COLORS.reduce((sum, color) => sum + pips[color], 0);
    const floorFor = (color) => (!totalPips ? 0 : Math.max(6, Math.round(lands * (pips[color] / totalPips) * 0.9)));
    const thin = MANA_COLORS.filter((color) => pips[color] > 0 && sources[color] < floorFor(color));
    return {
      sources, pips, lands, spells, thin, floorFor,
      averageValue: spells ? totalValue / spells : 0
    };
  }

  /* ---------------- what a card is for, and where it would fit ----------------
   * The same eight role tests sim-engine runs when it scores a deck, so "this is
   * removal" means the same thing sitting in a slot as it does in the simulation.
   * tests/slot-model.mjs asserts the pair agree across the whole catalog.
   */
  const ROLE_KEYS = ["ramp", "draw", "removal", "wipe", "protection", "recursion", "tutor", "finisher"];
  const ROLE_LABEL = {
    ramp: "ramp", draw: "draw", removal: "removal", wipe: "a sweeper",
    protection: "protection", recursion: "recursion", tutor: "a tutor", finisher: "a finisher"
  };

  function manaValueOf(card) {
    const stated = Number(card && card.cmc);
    if (Number.isFinite(stated) && stated > 0) return stated;
    return manaCostOf(card && card.manaCost).value;
  }

  // Reminder text is always parenthesised and never carries rules meaning.
  // Kept identical to sim-engine's stripReminder on purpose.
  function stripReminder(text) {
    return String(text).replace(/\([^()]*\)/g, " ").replace(/[ \t]{2,}/g, " ");
  }

  function cardRoles(card) {
    const typeLine = String((card && card.typeLine) || "");
    const text = stripReminder(String((card && card.oracleText) || "").toLowerCase().replace(/[’]/g, "'"));
    const isLand = /\bLand\b/.test(typeLine);
    const isCreature = /Creature/.test(typeLine);
    const roles = [];
    const add = (role, hit) => { if (hit) roles.push(role); };
    add("ramp", !isLand && (/\{t\}: add|add \{[wubrgc]\}/.test(text)
      || PUTS_LAND_ONTO_BATTLEFIELD.test(text)
      || /you may play an additional land/.test(text)
      || makesTreasureFreely(text)));
    add("draw", /draw (?:a|one|two|three|four|x|\d+) cards?|draws? that many cards|draw cards equal/.test(text)
      && !/each opponent draws/.test(text));
    add("removal", /destroy target|exile target (?:creature|permanent|artifact|enchantment|planeswalker|nonland)|deals? \d+ damage to (?:target|any target)|fights? target|return target (?:creature|permanent|nonland permanent) to its owner's hand|target creature gets [-−]/.test(text));
    add("wipe", /destroy all|exile all|all creatures get [-−]|each player sacrifices|return all creatures|destroy each creature|each creature deals damage equal to its (?:power|toughness) to itself/.test(text));
    add("protection", /hexproof|indestructible|protection from|counter target spell|regenerate|phases? out|prevent all damage|can't be countered/.test(text));
    add("recursion", /return target .{0,40}from your graveyard|return .{0,30}from your graveyard to (?:the battlefield|your hand)/.test(text));
    add("tutor", /search your library for an? (?:card|artifact|creature|enchantment|instant|sorcery|permanent)/.test(text));
    add("finisher", /you win the game|each opponent loses \d+ life|extra combat phase|deals damage equal to/.test(text)
      || (isCreature && manaValueOf(card) >= 5));
    return roles;
  }

  // Instants and sorceries do the same job at different speeds; artifacts and
  // enchantments are both "a permanent that sits there". Near-misses, worth half.
  const SOFT_TYPE = {Instant: "spell", Sorcery: "spell", Artifact: "permanent", Enchantment: "permanent"};
  function article(type) {
    return /^[AEIOU]/.test(type) ? `an ${type.toLowerCase()}` : `a ${type.toLowerCase()}`;
  }

  /**
   * Whether a card you own could stand in for the card a slot was built around.
   *
   * The question a pile of cards on the table actually poses is not "is this good" but
   * "does this do the job that card was doing". So the score is built from the three
   * things that decide that, in the order they matter:
   *
   *   type      a Creature slot wants a creature; swapping one for an Instant changes
   *             the deck's shape, not just its contents
   *   role      what the card is FOR -- removal for removal, ramp for ramp -- read with
   *             sim-engine's own tests so the page and the simulation agree
   *   cost      a four-drop standing in for a two-drop is a different card in play even
   *             when it does the same thing on paper
   *
   * Color is not scored, it is a gate: a card outside the deck's identity is not a
   * worse fit, it is not legal, and the caller filters it out before scoring.
   *
   * Returns a score and the reasons behind it, because a bare number ranking cards you
   * own is a number you have no way to argue with.
   */
  function slotFit(card, target) {
    const want = target || {};
    const reasons = [];
    let score = 0;

    const type = cardType(card);
    const wantType = want.type || "";
    if (wantType && type === wantType) { score += 5; reasons.push(`also ${article(type)}`); }
    else if (wantType && SOFT_TYPE[type] && SOFT_TYPE[wantType] === SOFT_TYPE[type]) { score += 2; reasons.push("same kind of spell"); }

    const roles = cardRoles(card);
    const wanted = want.roles || [];
    const shared = roles.filter((role) => wanted.indexOf(role) >= 0);
    shared.slice(0, 2).forEach((role) => { score += 3; reasons.push(ROLE_LABEL[role]); });

    /* Cost is a tie-breaker, not a qualification. A five-drop standing in for a two-drop
       is a real problem, but it is a smaller problem than putting a creature where the
       deck wanted an instant -- so the type match outweighs any cost gap, and the gap
       only bites once it is big enough to change when the card is castable. */
    const value = manaValueOf(card);
    const wantValue = Number(want.manaValue);
    if (Number.isFinite(wantValue) && wantValue > 0) {
      const gap = Math.abs(value - wantValue);
      if (gap === 0) { score += 2; reasons.push("same cost"); }
      else if (gap === 1) { score += 1; reasons.push("within a mana"); }
      else if (gap >= 3) { score -= Math.min(3, gap - 2); }
    }

    return {score, reasons, roles, shared, manaValue: value, type};
  }

  function rungHeading(rung, name, predecessorName, authored) {
    const card = name || "this card";
    const prev = predecessorName;
    if (rung === "base") return authored ? "What this slot does" : "What the Base card does · its own rules text";
    if (!authored) return `What ${card} does · no rung note written yet`;
    if (rung === "tuned") return prev ? `How ${card} fits the strategy better than ${prev}` : `How ${card} fits the strategy`;
    if (rung === "enhance") return prev ? `How ${card} improves on ${prev}'s fit` : `How ${card} improves the slot`;
    if (rung === "fun") return `What makes ${card} fun`;
    if (rung === "max") return `How ${card} maximizes Tier 3`;
    if (rung === "alt") return `Why ${card} as the alternate commander`;
    return `Why ${card}`;
  }

  /* ---------------- price bands ----------------
   * These are physical drawers at a vendor table, not a computed histogram, so the
   * list is fixed and every band exists whether or not anything falls in it today.
   */
  const PRICE_BANDS = ["<$1", "$1", "$2", "$3", "$4", "$5", "$6", "$7-15", "$15+"];
  function priceBand(price) {
    // An unpriced card has no drawer. A genuinely free one belongs in the cheap drawer,
    // so null/undefined/"" must not coerce their way to 0.
    if (price === null || price === undefined || price === "") return null;
    const p = Number(price);
    if (!Number.isFinite(p) || p < 0) return null;
    if (p < 1) return "<$1";
    if (p < 7) return "$" + Math.floor(p);
    if (p < 15) return "$7-15";
    return "$15+";
  }

  /* ---------------- ownership ----------------
   * Money spent is not a card in hand. One key replaces `found` + `boughtQuantities`
   * and adds the state that was missing: ordered and in transit.
   */
  const ACQ = {NONE: "Not in hand", ORDERED: "Ordered", PARTIAL: "Partly here", HAND: "In hand"};

  /* Where a card physically is. Owning a card and having it sleeved in this deck's
     box are different facts: there are six boxes, and one copy sits in exactly one
     of them. PLACE.ACTIVE means "in this deck's box"; PLACE.OWNED means "in hand,
     but in another box or loose on the bench". */
  const PLACE = {ACTIVE: "active", OWNED: "owned", ORDERED: "ordered", BUY: "buy", EMPTY: "empty"};

  function ownedKey(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  /** Migrate the legacy pair into the new shape. Lossless: found+qty becomes inHand. */
  function normalizeOwned(state) {
    const out = {};
    const found = (state && state.found) || {};
    const qty = (state && state.boughtQuantities) || {};
    const existing = (state && state.owned) || {};
    Object.keys(existing).forEach((k) => {
      const v = existing[k] || {};
      out[k] = {inHand: Math.max(0, Number(v.inHand) || 0), ordered: Math.max(0, Number(v.ordered) || 0)};
    });
    Object.keys(found).forEach((k) => {
      if (!found[k] || out[k]) return;
      out[k] = {inHand: Math.max(1, Number(qty[k]) || 1), ordered: 0};
    });
    Object.keys(qty).forEach((k) => {
      if (out[k]) return;
      const n = Number(qty[k]) || 0;
      if (n > 0) out[k] = {inHand: n, ordered: 0};
    });
    return out;
  }

  function ownedCount(owned, name) {
    const rec = (owned || {})[ownedKey(name)] || {};
    return {inHand: Math.max(0, Number(rec.inHand) || 0), ordered: Math.max(0, Number(rec.ordered) || 0)};
  }

  /* Where a pile of copies stands, given how many of them are actually here. Kept apart
     from the ledger lookup because the two answer different questions: the ledger knows
     how many copies exist, and a shop row needs to know how many of them this row got.
     A card owned once and already sleeved in another deck is not "in hand" for the deck
     still asking for it. */
  function acquisitionFor(quantity, inHand, ordered) {
    const need = Math.max(1, Number(quantity) || 1);
    const have = Math.max(0, Number(inHand) || 0);
    const coming = Math.max(0, Number(ordered) || 0);
    if (have >= need) return ACQ.HAND;
    if (have > 0) return ACQ.PARTIAL;
    if (coming > 0) return have + coming >= need ? ACQ.ORDERED : ACQ.PARTIAL;
    return ACQ.NONE;
  }

  function acquisitionOf(owned, name, quantity) {
    const {inHand, ordered} = ownedCount(owned, name);
    return acquisitionFor(quantity, inHand, ordered);
  }

  /* ---------------- card facts ---------------- */
  /**
   * Where a card physically sits at a vendor's table. This is not a store name and
   * not a stored field - a seller shelves by price, so it falls straight out of the
   * price. Coarser than the price band on purpose: the band tells you which dollar
   * drawer, this tells you which container to walk to.
   */
  const SPOTS = ["Bulk bin", "Boxes", "Binder", "Case"];
  function vendorSpot(price) {
    const band = priceBand(price);
    if (band === null) return null;
    if (band === "<$1") return "Bulk bin";
    if (band === "$7-15") return "Binder";
    if (band === "$15+") return "Case";
    return "Boxes";               // the $1 through $6 drawers
  }

  const BASICS = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes"]);
  const TYPE_ORDER = ["Commander", "Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Planeswalker", "Battle", "Land", "Other"];

  function cardType(item) {
    const line = String((item && item.typeLine) || "");
    if (/\bLand\b/i.test(line)) return "Land";
    if (/\bCreature\b/i.test(line)) return "Creature";
    if (/\bPlaneswalker\b/i.test(line)) return "Planeswalker";
    if (/\bBattle\b/i.test(line)) return "Battle";
    if (/\bArtifact\b/i.test(line)) return "Artifact";
    if (/\bEnchantment\b/i.test(line)) return "Enchantment";
    if (/\bInstant\b/i.test(line)) return "Instant";
    if (/\bSorcery\b/i.test(line)) return "Sorcery";
    return "Other";
  }
  function isBasicLand(item) {
    return BASICS.has(Lineup.normalizeName((item && item.name) || ""));
  }

  /**
   * Why this rung, not the others. Base states what the slot is for; the other four
   * each answer their own question against it. Fields already exist per item in
   * buy-plans.json - this only decides which one a rung speaks with.
   */
  /**
   * Where a rung's rationale came from. Base cards carry no authored `purpose` in
   * buy-plans.json, so the UI must not claim to be stating the slot's thesis when
   * all it has is the card's own rules text. Authoring real Base copy is a content
   * task; until then the label has to tell the truth about what it is showing.
   */
  function whySource(rung, item, cards) {
    if (whyFor(rung, item)) return "authored";
    const fact = cards ? cards[Lineup.normalizeName(item && item.name)] : null;
    const oracle = (fact && fact.oracleText) || (item && item.oracleText);
    return oracle ? "oracle" : "none";
  }
  function whyText(rung, item, cards) {
    const authored = whyFor(rung, item);
    if (authored) return authored;
    const fact = cards ? cards[Lineup.normalizeName(item && item.name)] : null;
    return (fact && fact.oracleText) || (item && item.oracleText) || "";
  }

  function whyFor(rung, item) {
    if (!item) return "";
    const pick = (...keys) => {
      for (const k of keys) { const v = item[k]; if (typeof v === "string" && v.trim()) return v.trim(); }
      return "";
    };
    if (rung === "base") return pick("purpose", "whyPrimary", "why");
    if (rung === "enhance") return pick("whyOptional", "purpose", "why");
    if (rung === "max") return pick("maxReason", "whyOptional", "purpose");
    return pick("purpose", "whyPrimary", "why", "alternateReason");
  }

  /** null/undefined/"" must not coerce to 0 - Number(null) is 0, and a card priced
   *  at $0.00 is a very different claim from a card whose price we do not know. */
  function num(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function priceOf(item, cards) {
    const own = num(item && item.price);
    // A plan price of exactly 0 is missing data wearing a zero, not a free card:
    // the set includes City of Traitors and Cabal Ritual. Let the catalog answer.
    if (own !== null && own !== 0) return own;
    // Starting-shell items frequently carry no price of their own, so fall back to
    // the baked catalog before giving up. Without this a deck's "to buy" total
    // silently reads its own base cards as free.
    const fact = cards ? cards[Lineup.normalizeName(item && item.name)] : null;
    return fact ? num(fact.price) : null;
  }
  function ceilingOf(item) { return num(item && item.ceiling); }

  /* ---------------- the projection ----------------
   * One row per slot, carrying every rung so the UI can drill sideways without
   * another lookup, and the selected rung marked. Slots with no selection are
   * returned as holes rather than dropped, because a hole is a real state.
   */
  function deckSlots(plan, selection, options) {
    const opts = options || {};
    const owned = opts.owned || {};
    const model = Lineup.buildModel(plan, opts.extraCandidates || []);
    const selected = new Set();
    Lineup.ARRAY_KEYS.forEach((key) => {
      ((selection && selection[key]) || []).forEach((id) => selected.add(String(id)));
    });

    const rows = [];
    model.groups.forEach((entries, slotId) => {
      const shell = entries.find((e) => e.kind === "shell") || entries[0];
      const nameById = new Map(entries.map((e) => [e.id, e.item && e.item.name]));
      const rungs = entries
        .filter((e) => !(e.item && e.item.isFlexibleSlot))
        .map((e) => ({
          rung: rungOf(e.kind),
          kind: e.kind,
          entryId: e.id,
          name: e.item.name,
          quantity: Math.max(1, Number(e.item.quantity) || 1),
          price: priceOf(e.item, opts.cards),
          ceiling: ceilingOf(e.item),
          replaces: e.item.replaces || null,
          isCommander: !!e.item.isCommander,
          gameChanger: !!e.item.gameChanger,
          predecessorName: nameById.get(e.predecessorId) || (shell && shell.item ? shell.item.name : null),
          why: whyText(rungOf(e.kind), e.item, opts.cards),
          whySource: whySource(rungOf(e.kind), e.item, opts.cards),
          selected: selected.has(e.id)
        }))
        .sort((a, b) => {
          const ai = RUNG_ORDER.indexOf(a.rung), bi = RUNG_ORDER.indexOf(b.rung);
          return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
        });

      if (!rungs.length) return;
      const pick = rungs.find((r) => r.selected) || null;
      const face = pick || rungs[0];
      const name = pick ? pick.name : null;
      rows.push({
        slotId,
        shellName: shell && shell.item ? shell.item.name : face.name,
        // A slot's identity is its shell card, not whatever rung is picked right
        // now. Deriving the type from the pick re-filed the row into a different
        // group on almost every pick -- thirteen of fourteen slots measured, moving
        // up to 2,900px -- so choosing a card made the open pane appear to slam
        // shut when it had only been carried somewhere else on the page. The name,
        // price, location and rung badge all still follow the pick; only where the
        // row LIVES is anchored, because that is the part the reader is holding on
        // to while they compare candidates.
        type: shell && shell.item && shell.item.isCommander ? "Commander" : cardType((shell && shell.item) || {}),
        isBasic: isBasicLand(shell && shell.item),
        quantity: pick ? pick.quantity : face.quantity,
        filled: !!pick,
        pick: pick ? {
          rung: pick.rung, entryId: pick.entryId, name: pick.name,
          price: pick.price, ceiling: pick.ceiling, band: priceBand(pick.price),
          why: pick.why, whySource: pick.whySource, predecessorName: pick.predecessorName,
          quantity: pick.quantity
        } : null,
        acquisition: name ? acquisitionOf(owned, name, pick.quantity) : ACQ.NONE,
        spot: pick ? vendorSpot(pick.price) : null,
        rungs
      });
    });

    rows.sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type), bi = TYPE_ORDER.indexOf(b.type);
      if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      // Sorted on the shell name for the same reason: alphabetical by the card
      // currently showing would re-order the list under the reader's cursor every
      // time they tried a candidate.
      return String(a.shellName).localeCompare(String(b.shellName));
    });
    return rows;
  }

  /**
   * The same rows re-keyed for shopping: one line per card name, merged across every
   * deck, quantities summed. Basics collapse here the opposite way they do on the
   * Deck page - Forest x25 across six decks instead of Forest x11 in one.
   */
  /**
   * One row per card the six boxes ask for, with what you hold against it.
   *
   * `holds` is optional and, when given, decides the split instead of the global ledger:
   * a map of card key to {inHand, ordered} counting only the copies the decks were
   * actually allocated. Without it the Shop asks "do I own one of these", which is a
   * different question from "is every box that wants one going to get one" -- and the two
   * disagree by exactly the copies sitting on the bench, so the Shop said four fewer
   * cards to buy than the six Deck pages did.
   */
  function shopRows(decks, owned, holds, perDeck) {
    const map = new Map();
    (decks || []).forEach((deck) => {
      (deck.slots || []).forEach((slot) => {
        if (!slot.pick) return;
        const key = ownedKey(slot.pick.name);
        let row = map.get(key);
        if (!row) {
          row = {
            key, name: slot.pick.name, price: slot.pick.price, ceiling: slot.pick.ceiling,
            band: priceBand(slot.pick.price), spot: vendorSpot(slot.pick.price),
            type: slot.type, isBasic: slot.isBasic,
            quantity: 0, decks: [], rungs: [], byDeck: {}
          };
          map.set(key, row);
        }
        row.quantity += slot.pick.quantity;
        row.byDeck[deck.id] = (row.byDeck[deck.id] || 0) + slot.pick.quantity;
        if (row.decks.indexOf(deck.id) < 0) row.decks.push(deck.id);
        if (row.rungs.indexOf(slot.pick.rung) < 0) row.rungs.push(slot.pick.rung);
      });
    });
    return Array.from(map.values()).map((row) => {
      /* When an allocation is given it is complete: a card with no entry was allocated to
         nobody, which is not the same as a card nobody owns. Falling back to the ledger
         there put "you have one" against a card every box had been denied, and the Shop
         dropped it from the list while the Deck pages still asked for it. */
      const allocated = holds ? (holds[row.key] || {inHand: 0, ordered: 0}) : null;
      const {inHand, ordered} = allocated || ownedCount(owned, row.name);
      row.inHand = Math.min(inHand, row.quantity);
      row.ordered = Math.min(ordered, Math.max(0, row.quantity - row.inHand));
      row.need = Math.max(0, row.quantity - row.inHand - row.ordered);
      /* Read off this row's own copies, not the ledger. The two disagree whenever a card
         is owned once and wanted twice: the ledger says "in hand", the row says one copy
         is still to buy, and the status filter believed the ledger -- so "Not in hand"
         hid forty cards that were genuinely still owed. */
      row.acquisition = acquisitionFor(row.quantity, row.inHand, row.ordered);
      /* What each deck's share of the pile looks like on its own. Which box got which
         copy is the allocator's answer; without it a per-deck split would be a guess, so
         the breakdown carries quantity alone and scopeRow leaves the row whole. */
      const split = perDeck || null;
      row.decks.forEach((id) => {
        const want = row.byDeck[id];
        const got = split ? ((split[id] || {})[row.key] || {inHand: 0, ordered: 0}) : null;
        const held = got ? Math.min(got.inHand, want) : null;
        const coming = got ? Math.min(got.ordered, Math.max(0, want - held)) : null;
        row.byDeck[id] = {
          quantity: want,
          inHand: held,
          ordered: coming,
          need: got ? Math.max(0, want - held - coming) : null,
          acquisition: got ? acquisitionFor(want, held, coming) : null
        };
      });
      return row;
    });
  }

  /**
   * The same row, but describing only the decks asked about. Filtering the Shop to one
   * deck asks "what do I still need for this deck", and an unscoped row cannot answer it:
   * Sol Ring sits in six decks, one copy is owned, and the row says "Partly here" no
   * matter which deck you are shopping for. Returns null when none of these decks want
   * the card, and the row untouched when no deck was named or no allocation was supplied.
   */
  function scopeRow(row, deckIds) {
    const ids = (deckIds || []).filter((id) => row.byDeck && row.byDeck[id]);
    if (!ids.length || ids.length === (row.decks || []).length) {
      return (deckIds || []).length && !ids.length ? null : row;
    }
    if (ids.some((id) => row.byDeck[id].need === null)) return row;
    const sum = (field) => ids.reduce((n, id) => n + row.byDeck[id][field], 0);
    const quantity = sum("quantity");
    const inHand = sum("inHand");
    const ordered = sum("ordered");
    return Object.assign({}, row, {
      quantity, inHand, ordered,
      need: Math.max(0, quantity - inHand - ordered),
      acquisition: acquisitionFor(quantity, inHand, ordered),
      scopedTo: ids.slice()
    });
  }

  return {
    RUNG_ORDER, RUNG_LABEL, RUNG_BY_KIND, rungOf,
    BUILD_RUNGS, RUNG_CHAIN, rungForStage, selectionForRung, selectionSignature, activeRung, rungTwins,
    nearestRung,
    PRICE_BANDS, priceBand,
    ACQUISITION: ACQ, PLACE, ownedKey, normalizeOwned, ownedCount, acquisitionOf, acquisitionFor,
    SPOTS, vendorSpot, rungHeading, cardImage,
    MANA_COLORS, manaCostOf, producesColors, manaHealth,
    ROLE_KEYS, ROLE_LABEL, manaValueOf, cardRoles, slotFit,
    TYPE_ORDER, cardType, isBasicLand, whyFor, whyText, whySource,
    deckSlots, shopRows, scopeRow
  };
});
