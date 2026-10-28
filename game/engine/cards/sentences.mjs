/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE SENTENCE LIBRARY: EVERY ORACLE SENTENCE THE DEFINED CARDS ALREADY TRANSLATE, AS A TEMPLATE WITH SLOTS (card load
 * step 2; Linear ROB-87; docs/engine/plan-card-load-program.md).
 *
 * Every ability of a defined card carries the oracle sentence it implements (`text`, held to the card by
 * compile.mjs `checkFidelity`). So the directory is already a parallel text: sentence on one side, structured ability on
 * the other. This file turns each pair into a template and back:
 *
 *   - THE TEMPLATE is the sentence with its reminder text out, the card's own name as `~`, lower case, and its numbers
 *     as slots: "Lightning Bolt deals 3 damage to any target." is `~ deals N damage to any target`, slot [3]. A mana
 *     number (`{2}`) is a slot of its own kind, and so is a power/toughness change (`+N/+N`); a "+1/+1 counter" is a
 *     name, never a slot. That is level 1. Level 2 also makes slots of colors, card types, the common keywords and the
 *     basic land types (`target TYPE gains KW until end of turn`), and is tried only where level 1 knows nothing.
 *   - THE BODY is the ability without its text, each number, mana number or word that is a slot's value replaced by the
 *     slot, so `{effect: "dealDamage", amount: 3}` is `{effect: "dealDamage", amount: {$slot: 0}}`. A number reaches only
 *     a number slot and a mana number only a mana string, so `{1}{B}: ~ gets +1/+1` cannot pay its {1} into the +1.
 *     Two slots with one value are taken in the text's order. A quoted ability inside (a granted "{T}: Add one mana of
 *     any color.") keeps its text, its name and numbers as placeholders.
 *   - A TEMPLATE'S TRANSLATION is the body most of its cards agree on (a tie: the shorter JSON), every ability the card
 *     wrote for the sentence. A card is translated by
 *     covering its oracle text with templates (`segment`: its lines, sentences and keyword words, spans of them tried
 *     longest-first through a cover with the fewest gaps), then filling each template's body with the card's own slot
 *     values, its own sentence as the ability's text.
 *
 * A SPELL OF SEVERAL SENTENCES is learned sentence by sentence too, where each sentence is one effect with its own
 * targets ("Exile target nonland permanent. You lose 3 life."): `spellParts` splits it, and keeps the split only when the
 * parts put back together (`composeSpell`) are the card's own ability. A card is then translated with consecutive spell
 * sentences composed into one spell, so "Draw a card." after a known spell is no longer a sentence nobody writes.
 *
 * Every translation can be made with one card held out (`except`): the template's cards other than it, the body they
 * agree on. That is the calibration (game/tools/sentence-library.mjs): each defined card held out, translated from the
 * rest, and played through its own scenarios; a template's pass rate is the share of its cards that then pass. A rate is
 * a measurement, never a promise: "fully accurate" is still proved by scenarios and play.
 *
 * Oracle text and our own definitions only (ADR-001). Pure: no file, no network, so the compiler (step 3) and the
 * Worker's loader (step 5) build the same library from the same directory.
 */

export const LIBRARY_SCHEMA = "CrankSentenceLibrary@1";

/* A script with anything beside its abilities (an Adventure, a back face, a prepare spell, a layout) is not templated:
   its other half has no sentence pairs of its own here. */
const SIMPLE = new Set(["schema", "identity", "oracleText", "source", "abilities"]);
export const isSimple = (script) => Object.keys(script ?? {}).every((k) => SIMPLE.has(k));

const WORDS = Object.freeze({one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fifteen: 15, twenty: 20});
const COLORS = Object.freeze({white: "W", blue: "U", black: "B", red: "R", green: "G"});
const TYPES = Object.freeze(["artifact", "battle", "creature", "enchantment", "instant", "land", "planeswalker", "sorcery"]);
const BASICS = Object.freeze(["plains", "island", "swamp", "mountain", "forest"]);
/* The common keywords: the ones a sentence names as a word, and the definitions write as `keyword` or in `keywords`. */
const KEYWORDS = Object.freeze(["first strike", "double strike", "flying", "trample", "haste", "vigilance", "lifelink",
  "deathtouch", "reach", "menace", "hexproof", "indestructible", "defender", "flash", "prowess"]);

const title = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const titleWords = (w) => w.split(" ").map(title).join(" ");
/* Typography to plain characters, one for one, so an offset in the clean text is an offset in the card's own. */
const clean = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, "\"").replace(/[—–−]/g, "-");
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/* The forms a card's name takes in its text: each face's whole name, and a legend's short name ("Krenko"). */
const nameForms = (name) => {
  const out = [];
  for (const part of clean(name).split(" // ")) {
    out.push(part);
    const short = part.split(",")[0];
    if (short !== part && short.length > 3) out.push(short);
  }
  return out.sort((a, b) => b.length - a.length);
};
/* A line that is all reminder text is the ability (a basic land's "({T}: Add {W}.)"); anywhere else reminder text
   explains a keyword and is dropped (compile.mjs `withoutReminders` claims the same). */
const dropReminders = (line) => {
  const t = line.trim();
  if (/^\([^()]*\)$/.test(t)) return t.slice(1, -1);
  return t.replace(/\s*\([^)]*\)/g, "").trim();
};

const NUMBER_SLOTS = String.raw`([+-]?\d+/[+-]?\d+ counters?)|([+-]?\d+)/([+-]?\d+)|\{(\d+)\}|\b(\d+)\b|\b(${Object.keys(WORDS).join("|")})\b`;
const WORD_SLOTS = String.raw`|\b(${KEYWORDS.join("|")})\b|\b(${Object.keys(COLORS).join("|")})\b|\b(${TYPES.join("|")})(s)?\b|\b(${BASICS.join("|")})(e?s)?\b`;
const SLOT_RE = {1: new RegExp(NUMBER_SLOTS, "g"), 2: new RegExp(NUMBER_SLOTS + WORD_SLOTS, "g")};

/* Each match of a level's slots: its piece of template and its slots, in the text's order. */
function slotsIn(text, level) {
  const out = [];
  const key = text.replace(SLOT_RE[level], (m, counter, p, t, mana, digit, word, kw, color, type, plural, basic, bplural) => {
    if (counter !== undefined) return m;
    if (p !== undefined) {
      out.push({kind: "pt", v: Number(p), raw: p}, {kind: "pt", v: Number(t), raw: t});
      return `${/^[+-]/.test(p) ? p[0] : ""}N/${/^[+-]/.test(t) ? t[0] : ""}N`;
    }
    if (mana !== undefined) { out.push({kind: "mana", v: Number(mana), raw: mana}); return "{N}"; }
    if (digit !== undefined) { out.push({kind: "num", v: Number(digit), raw: digit}); return "N"; }
    if (word !== undefined) { out.push({kind: "num", v: WORDS[word], raw: word}); return "N"; }
    if (kw !== undefined) { out.push({kind: "keyword", v: kw, raw: kw}); return "KW"; }
    if (color !== undefined) { out.push({kind: "color", v: COLORS[color], raw: color}); return "COLOR"; }
    if (type !== undefined) { out.push({kind: "type", v: type, raw: type}); return plural ? "TYPEs" : "TYPE"; }
    out.push({kind: "basic", v: basic, raw: basic});
    return bplural ? "BASICs" : "BASIC";
  });
  return {key, slots: out};
}

/** A sentence's template at a level (1: numbers; 2: also colors, types, keywords, basic land types) and its slots. */
export function templateOf(text, name, level = 1) {
  let t = clean(text).split("\n").map(dropReminders).join(" ");
  for (const form of nameForms(name)) t = t.replace(new RegExp(escape(form), "g"), "~");
  t = t.replace(/\s+/g, " ").trim().toLowerCase().replace(/\s*\.$/, "");
  return slotsIn(t, level);
}

/* The JSON forms of a word slot's value: a keyword is written `flying` as an ability and `Flying` in a grant, a color
   `G` or `Green`, a type `Creature`. */
const formsOf = (slot) => {
  if (slot.kind === "color") return {code: slot.v, title: title(Object.keys(COLORS).find((w) => COLORS[w] === slot.v))};
  /* A grant writes "First Strike", more often than "First strike": a one-word value is read as the former, so it is
     written back the way a two-word one would be. */
  if (["keyword", "type", "basic"].includes(slot.kind)) return {lower: slot.v, words: titleWords(slot.v), title: title(slot.v)};
  return {};
};
const NUMERIC = new Set(["num", "pt"]);

/* A quoted ability's text, as placeholders: the card's name `[$~]`, each piece that is one of the outer sentence's slots
   `[$i]` (taken in order), so the filled text is the new card's own words. */
function abstractText(text, name, slots, level) {
  let s = clean(text);
  for (const form of nameForms(name)) s = s.replace(new RegExp(escape(form), "g"), "[$~]");
  let next = 0;
  const take = (kind, raw) => {
    for (let i = next; i < slots.length; i++) if (slots[i].kind === kind && String(slots[i].raw).toLowerCase() === String(raw).toLowerCase()) { next = i + 1; return `[$${i}]`; }
    return null;
  };
  return s.replace(SLOT_RE[level], (m, counter, p, t, mana, digit, word, kw, color, type, plural, basic) => {
    if (counter !== undefined) return m;
    if (p !== undefined) { const a = take("pt", p), b = take("pt", t); return a && b ? `${a}/${b}` : m; }
    if (mana !== undefined) { const got = take("mana", mana); return got ? `{${got}}` : m; }
    const piece = digit ?? word ?? kw ?? color ?? type ?? basic;
    const kind = digit !== undefined || word !== undefined ? "num" : kw !== undefined ? "keyword" : color !== undefined ? "color" : type !== undefined ? "type" : "basic";
    const got = take(kind, piece);
    return got ? m.replace(piece, got) : m;
  });
}

/**
 * The ability as a body: no text or id at its top, each slot's value replaced by the slot.
 *
 * @param {object} ability  one ability of a defined card
 * @param {{kind: string, v: number|string, raw: string}[]} slots  its sentence's slots (`templateOf`)
 * @param {string} name  the card's name, for a quoted ability's text
 */
export function abstractBody(ability, slots, name = "", level = 1) {
  const queue = (pred) => {
    const q = new Map();
    slots.forEach((s, i) => { if (pred(s)) { const k = String(s.v); if (!q.has(k)) q.set(k, []); q.get(k).push(i); } });
    return q;
  };
  const numbers = queue((s) => NUMERIC.has(s.kind)), manas = queue((s) => s.kind === "mana");
  const words = new Map();
  slots.forEach((s, i) => { for (const [form, f] of Object.entries(formsOf(s))) { if (!words.has(f)) words.set(f, []); words.get(f).push({i, form}); } });
  const used = new Map();
  const pop = (q, k) => { const list = q.get(k); const n = used.get(list) ?? 0; used.set(list, n + 1); return list[Math.min(n, list.length - 1)]; };
  /* A mana number written as a number ("cost {1} more", `amount: 1`) is its slot only where no mana string took it and
     no number slot has its value: `{1}, {T}, Sacrifice: Draw a card.` keeps its draw at one. */
  const strings = JSON.stringify({...ability, text: undefined});
  const looseMana = new Map([...manas].filter(([k]) => !numbers.has(k) && !strings.includes(`{${k}}`)));
  const walk = (v, depth, key) => {
    /* `{target: 0}` points at a target; it is never a number of the sentence's. */
    if (typeof v === "number" && key === "target") return v;
    if (typeof v === "number" && numbers.has(String(v))) return {$slot: pop(numbers, String(v))};
    if (typeof v === "number" && looseMana.has(String(v))) return {$slot: pop(looseMana, String(v))};
    if (typeof v === "string") {
      if (key === "text") return abstractText(v, name, slots, level);
      if (words.has(v)) { const w = pop(words, v); return {$slot: w.i, form: w.form}; }
      return v.replace(/\{(\d+)\}/g, (m, d) => (manas.has(d) ? `{$${pop(manas, d)}}` : m));
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1, null));
    if (v && typeof v === "object") {
      const o = {};
      for (const k of Object.keys(v)) { if (depth === 0 && (k === "text" || k === "id")) continue; o[k] = walk(v[k], depth + 1, k); }
      return o;
    }
    return v;
  };
  return walk(ability, 0, null);
}

/** A body filled with a card's own slots: the inverse of `abstractBody`. */
export function fillBody(body, slots, name = "") {
  const walk = (v) => {
    if (v && typeof v === "object" && !Array.isArray(v) && "$slot" in v) {
      const s = slots[v.$slot];
      if (!s) return undefined;
      return v.form ? formsOf(s)[v.form] : s.v;
    }
    if (typeof v === "string") {
      return v.replace(/\{\$(\d+)\}/g, (m, i) => (slots[Number(i)] ? `{${slots[Number(i)].v}}` : m))
        .replace(/\[\$(~|\d+)\]/g, (m, i) => (i === "~" ? name : slots[Number(i)]?.raw ?? m));
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k]); return o; }
    return v;
  };
  return walk(body);
}

/* SPELL COMPOSITION. A plain spell (its targets and effects, nothing else) split into one part per sentence, and put back
   together: each part's targets are the next ones in order, exactly those its one effect refers to, so a later sentence
   that refers to an earlier one's target ("Its controller creates two Treasure tokens.") keeps the spell whole. */
const PLAIN_SPELL = new Set(["kind", "text", "targets", "effects"]);
const plainSpell = (a) => a?.kind === "spell" && Array.isArray(a.effects) && Object.keys(a).every((k) => PLAIN_SPELL.has(k));
const targetRefs = (v, out = []) => {
  if (Array.isArray(v)) v.forEach((x) => targetRefs(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (k === "target" && Number.isInteger(x)) out.push(x); else targetRefs(x, out); }
  return out;
};
const retarget = (v, move) => (Array.isArray(v) ? v.map((x) => retarget(x, move))
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "target" && Number.isInteger(x) ? move(x) : retarget(x, move)])) : v);
const canonical = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));

/** One spell from its parts, in order: their targets one list, each part's references moved past the targets before it. */
export function composeSpell(parts, text) {
  const targets = [], effects = [];
  for (const part of parts) {
    const offset = targets.length;
    targets.push(...(part.targets ?? []));
    effects.push(...part.effects.map((e) => retarget(e, (i) => i + offset)));
  }
  return {kind: "spell", text, ...(targets.length ? {targets} : {}), effects};
}

/** A plain spell of two or more sentences, one effect each, as one part per sentence -- or null where it is not that, or
    where the parts put back together would not be the spell. */
export function spellParts(ability) {
  if (!plainSpell(ability)) return null;
  const sentences = atomsOf(ability.text), effects = ability.effects, targets = ability.targets ?? [];
  if (sentences.length < 2 || sentences.length !== effects.length) return null;
  const parts = [];
  let next = 0;
  for (let i = 0; i < effects.length; i++) {
    const refs = [...new Set(targetRefs(effects[i]))].sort((a, b) => a - b);
    if (refs.length && (refs[0] !== next || refs.at(-1) !== next + refs.length - 1)) return null;
    parts.push({kind: "spell", text: sentences[i].text, ...(refs.length ? {targets: targets.slice(next, next + refs.length)} : {}),
      effects: [retarget(effects[i], (r) => r - next)]});
    next += refs.length;
  }
  return canonical(composeSpell(parts, ability.text)) === canonical(ability) ? parts : null;
}

/**
 * The library: each template at each level, with every card that writes it and the body each wrote.
 *
 * @param {object[]} scripts  CrankCardScript@1 scripts (the card directory)
 * @returns {{schema, templates: Map<string, {key, level, examples: {card, body}[]}>, cards: number}}
 *   a template's id is `<level>:<key>`; a body is the JSON of the abilities the card wrote for the sentence
 */
export function createLibrary(scripts) {
  const templates = new Map();
  let cards = 0;
  for (const script of scripts) {
    if (!isSimple(script)) continue;
    cards += 1;
    const name = script.identity.name;
    /* One sentence can be several abilities (an Equipment's "gets +2/+2 and has trample" is a layer 7c and a layer 6
       static): a template's body is every ability the card wrote for that sentence, in order. */
    const bySentence = new Map();
    for (const ability of script.abilities) {
      if (!bySentence.has(ability.text)) bySentence.set(ability.text, []);
      bySentence.get(ability.text).push(ability);
    }
    /* And each sentence of a spell that splits into parts, as a spell of its own. */
    const pairs = [...bySentence];
    for (const ability of script.abilities) for (const part of spellParts(ability) ?? []) pairs.push([part.text, [part]]);
    for (const [text, abilities] of pairs) {
      for (const level of [1, 2]) {
        const {key, slots} = templateOf(text, name, level);
        const id = `${level}:${key}`;
        if (!templates.has(id)) templates.set(id, {id, key, level, examples: []});
        templates.get(id).examples.push({card: name, body: JSON.stringify(abilities.map((a) => abstractBody(a, slots, name, level)))});
      }
    }
  }
  return {schema: LIBRARY_SCHEMA, templates, cards};
}

/** The cards that write a template, one card held out: how many there are, and the body most of them agree on. */
export function templateWithout(library, id, except = null) {
  const t = library.templates.get(id);
  if (!t) return null;
  const counts = new Map(), cards = new Set();
  for (const e of t.examples) {
    if (e.card === except) continue;
    cards.add(e.card);
    counts.set(e.body, (counts.get(e.body) ?? 0) + 1);
  }
  if (!cards.size) return null;
  let body = null, n = 0, all = 0;
  for (const [b, c] of counts) { all += c; if (c > n || (c === n && (b.length < body.length || (b.length === body.length && b < body)))) { body = b; n = c; } }
  return {id, key: t.key, level: t.level, cards: cards.size, body, agreement: n / all};
}

/* The pieces a card's text is covered with: each line's sentences (never split inside parentheses), a keyword line's
   words, each with its place in the text, so a span of them is the card's own words, reminders and line breaks kept. */
export function atomsOf(text) {
  const s = clean(text), out = [];
  let lineStart = 0;
  for (const line of s.split("\n")) {
    const pieces = [];
    let depth = 0, start = 0;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === "(") depth += 1;
      else if (c === ")") depth = Math.max(0, depth - 1);
      if (depth === 0 && (c === "." || c === ")") && /\s/.test(line[i + 1] ?? "") && /[A-Z{•"]/.test(line.slice(i + 1).trimStart()[0] ?? "")) {
        pieces.push([start, i + 1]); start = i + 1;
      }
    }
    pieces.push([start, line.length]);
    for (const [a, b] of pieces) {
      const raw = line.slice(a, b), lead = raw.length - raw.trimStart().length, body = raw.trim();
      if (!body) continue;
      const bare = dropReminders(body);
      if (!bare) continue;
      if (!/[.:]/.test(bare) && bare.includes(",")) {
        /* A keyword line: one piece per word, at depth 0. */
        let d = 0, w = 0;
        const words = [];
        for (let i = 0; i <= body.length; i++) {
          const c = body[i];
          if (c === "(") d += 1; else if (c === ")") d = Math.max(0, d - 1);
          if (i === body.length || (c === "," && d === 0)) { words.push([w, i]); w = i + 1; }
        }
        for (const [x, y] of words) {
          const piece = body.slice(x, y), pl = piece.length - piece.trimStart().length;
          if (piece.trim()) out.push({start: lineStart + a + lead + x + pl, end: lineStart + a + lead + x + pl + piece.trim().length, keyword: true});
        }
      } else out.push({start: lineStart + a + lead, end: lineStart + a + lead + body.length});
    }
    lineStart += line.length + 1;
  }
  return out.map((p) => ({...p, text: String(text ?? "").slice(p.start, p.end)}));
}

const LONGEST = 16;
/**
 * The card's text covered with templates: the fewest pieces left over, then the fewest level-2 templates, then the best
 * evidenced, then the fewest templates (an ability that is two sentences is one span). A card gets at most one spell
 * ability: plain spell templates next to each other are composed into one (`composeSpell`), any other spell stands alone.
 *
 * @returns {{atoms, gaps: string[], spans: {text, id, level}[]}}
 */
/* Only an instant or a sorcery has a spell ability (CR 113.3a): a permanent card's sentence is never covered by a template whose
   translation is a spell -- "{T}: Add {C}. You gain 1 life." (Pristine Talisman, Rob's lists P2) is one mana ability, not a
   mana ability and a spell -- so it is left for the writer, never translated wrong. */
const castable = (card) => (card?.identity?.types ?? []).some((t) => t === "Instant" || t === "Sorcery");
export function segment(text, name, library, except = null, {spells = true} = {}) {
  const atoms = atomsOf(text), n = atoms.length, raw = String(text ?? "");
  const known = new Map();
  const lookup = (span) => {
    for (const level of [1, 2]) {
      const {key} = templateOf(span, name, level);
      const id = `${level}:${key}`;
      if (!known.has(id)) known.set(id, templateWithout(library, id, except));
      if (known.get(id)) return known.get(id);
    }
    return null;
  };
  /* Then the better evidenced: a span costs one over the number of cards that wrote its template, so "Flying" and
     "deathtouch" (hundreds of cards between them) beat a "Flying, deathtouch" one card wrote as one ability. */
  const score = (c) => [c.gaps, c.level2, Number(c.doubt.toFixed(9)), c.spans.length];
  const better = (a, b) => { if (!b) return true; const x = score(a), y = score(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };
  const best = Array(n + 1).fill(null);
  best[0] = {gaps: 0, level2: 0, doubt: 0, spells: 0, plain: true, lastSpell: false, spans: [], left: []};
  for (let i = 0; i < n; i++) {
    const at = best[i];
    if (!at) continue;
    const skip = {...at, gaps: at.gaps + 1, lastSpell: false, left: [...at.left, atoms[i].text]};
    if (better(skip, best[i + 1])) best[i + 1] = skip;
    for (let j = i + 1; j <= Math.min(n, i + LONGEST); j++) {
      const span = raw.slice(atoms[i].start, atoms[j - 1].end);
      const t = lookup(span);
      if (!t) continue;
      const body = JSON.parse(t.body), spell = body.filter((a) => a.kind === "spell").length;
      if (spell && !spells) continue;
      const plain = body.length === 1 && plainSpell(body[0]);
      /* A second spell only as the next sentence after a first, both plain: one spell, composed. */
      if (spell && at.spells && !(at.lastSpell && at.plain && plain)) continue;
      const c = {gaps: at.gaps, level2: at.level2 + (t.level === 2 ? 1 : 0), doubt: at.doubt + 1 / t.cards, spells: at.spells + spell,
        plain: spell ? at.plain && plain : at.plain, lastSpell: spell > 0,
        spans: [...at.spans, {text: span, id: t.id, level: t.level, start: atoms[i].start, end: atoms[j - 1].end, spell: spell > 0}], left: at.left};
      if (better(c, best[j])) best[j] = c;
    }
  }
  const end = best[n] ?? {gaps: 0, spans: [], left: []};
  return {atoms, gaps: end.left, spans: end.spans};
}

/**
 * As much of a card as the library knows, for the writer to finish (card load step 4, the backstop): the abilities of
 * every span `keep` accepts, and the sentences left, each with its place in the text. A spell is never half written:
 * when anything is left, its sentences are left too, so the writer writes the whole spell.
 *
 * NOR IS ANY ABILITY (CR 113.2c: each paragraph of a card's text is one ability, but for keywords strung on one line,
 * 702.1c). A paragraph the library knows only in part is left whole, its known sentences with it, and asked of the writer
 * as one piece -- Gemstone Caverns' "{T}: Add {C}." is a sentence the library knows, and "If Gemstone Caverns has a luck
 * counter on it, instead add one mana of any color." the rest of that same mana ability: written apart, they would be two
 * mana abilities, and the luck counter's "instead" no option of the {C} one (library load L4, 2026-10-21). A keyword
 * line's words stay each its own ability.
 *
 * @returns {{known: object[], write: {text: string, start: number}[], templates: string[]}}
 */
export function partialTranslate(card, library, {except = null, keep = () => true} = {}) {
  const name = card.identity.name, raw = String(card.oracleText ?? "");
  const {atoms, spans} = segment(card.oracleText, name, library, except, {spells: castable(card)});
  const inside = (a, list) => list.some((s) => a.start >= s.start && a.end <= s.end);
  const trusted = spans.filter((s) => keep(s.id));
  const whole = trusted.length === spans.length && atoms.every((a) => inside(a, spans));
  const paragraph = (at) => (raw.slice(0, at).match(/\n/g) ?? []).length;
  const unspell = whole ? trusted : trusted.filter((s) => !s.spell);
  /* The paragraphs with a sentence left: none of their spans kept. */
  const open = new Set(atoms.filter((a) => !a.keyword && !inside(a, unspell)).map((a) => paragraph(a.start)));
  const kept = unspell.filter((s) => !open.has(paragraph(s.start)));
  const known = kept.flatMap((span) => {
    const t = templateWithout(library, span.id, except);
    const {slots} = templateOf(span.text, name, t.level);
    return JSON.parse(t.body).map((body) => ({...fillBody(body, slots, name), text: span.text}));
  });
  /* What is left, a paragraph's sentences together as the one ability they are; a keyword line's words, each alone. */
  const write = [];
  for (const a of atoms.filter((x) => !inside(x, kept))) {
    const last = write[write.length - 1];
    if (last && !a.keyword && last.paragraph === paragraph(a.start)) { last.end = a.end; continue; }
    write.push({start: a.start, end: a.end, paragraph: paragraph(a.start)});
  }
  return {known, write: write.map((w) => ({text: raw.slice(w.start, w.end), start: w.start})), templates: kept.map((s) => s.id)};
}

/**
 * A card's script from the library alone: its identity and text as given, its abilities filled from the templates
 * that cover its text. Nothing when any piece of the text is not in the library.
 *
 * @param {{identity: object, oracleText: string}} card  a script, or its identity and text
 * @returns {{ok: true, script, templates: string[]} | {ok: false, gaps: string[]}}
 */
export function translate(card, library, {except = null} = {}) {
  const name = card.identity.name;
  const {gaps, spans} = segment(card.oracleText, name, library, except, {spells: castable(card)});
  if (gaps.length || !spans.length) return {ok: false, gaps};
  const filled = spans.map((span) => {
    const t = templateWithout(library, span.id, except);
    const {slots} = templateOf(span.text, name, t.level);
    return JSON.parse(t.body).map((body) => ({...fillBody(body, slots, name), text: span.text}));
  });
  /* Consecutive spell spans (segment allows them only plain and next to each other) are one spell, its text theirs. */
  const abilities = [];
  for (let i = 0; i < spans.length; i++) {
    if (!spans[i].spell) { abilities.push(...filled[i]); continue; }
    let j = i;
    while (j + 1 < spans.length && spans[j + 1].spell) j += 1;
    if (j === i) abilities.push(...filled[i]);
    else abilities.push(composeSpell(filled.slice(i, j + 1).map((f) => f[0]), String(card.oracleText ?? "").slice(spans[i].start, spans[j].end)));
    i = j;
  }
  return {ok: true, script: {schema: card.schema ?? "CrankCardScript@1", identity: card.identity, oracleText: card.oracleText,
    source: "compiler", abilities}, templates: spans.map((s) => s.id)};
}
