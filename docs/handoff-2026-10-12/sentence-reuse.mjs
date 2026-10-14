// How much of every card's oracle text is sentences the defined cards already translate: the most a compiler built
// from them can reach (docs/engine/plan-card-load-program.md). Usage: node sentence-reuse.mjs <repo root>
import {readFileSync, readdirSync, statSync} from "node:fs";
import path from "node:path";
const root = process.argv[2];
const oracle = JSON.parse(readFileSync(path.join(root, "data/engine/oracle.json"), "utf8")).cards;
const {KEYWORDS} = await import(path.join(root, "game/engine/vocabulary.mjs"));
const {tableCards} = await import(path.join(root, "cloud/game-room.mjs"));
const kw = new Set(KEYWORDS.map((k) => k.toLowerCase()));
const NUMW = /\b(one|two|three|four|five|six|seven|eight|nine|ten|x)\b/g;
const norm = (text, name, loose) => {
  let t = String(text || "").replace(/\([^)]*\)/g, "");           // reminder text out
  for (const part of String(name).split(" // ")) { t = t.split(part).join("~"); const short = part.split(",")[0]; if (short.length > 3) t = t.split(short).join("~"); }
  t = t.replace(/\s+/g, " ").trim().toLowerCase();
  if (loose) t = t.replace(/\{\d+\}/g, "{N}").replace(/[+-]?\d+\/[+-]?\d+/g, "N/N").replace(/\b\d+\b/g, "N").replace(NUMW, "N");
  if (loose === 2) t = t.replace(/\{[wubrgc]\}/g, "{M}").replace(/\b(white|blue|black|red|green|colorless)\b/g, "COLOR")
    .replace(/\b(plains|island|swamp|mountain|forest)s?\b/g, "BASIC").replace(/\b(creature|artifact|enchantment|land|planeswalker|instant|sorcery|battle)(s)?\b/g, "TYPE$2")
    .replace(/\b(flying|trample|haste|vigilance|lifelink|deathtouch|reach|menace|first strike|double strike|hexproof|indestructible|ward \{n\})\b/g, "KW");
  return t;
};
// A card's text as its lines, then each line's sentences (a keyword line, "Flying, trample", stays whole).
const units = (card, loose) => String(card.text || "").split("\n").flatMap((line) => {
  const l = norm(line, card.name, loose);
  if (!l) return [];
  const parts = l.split(/,\s*/);
  if (parts.every((p) => kw.has(p.replace(/ \{.*$| n$| \d+$/, "").trim()))) return [{k: true, t: l}];
  return l.split(/(?<=[.!?])\s+(?=[a-z~{])/).filter(Boolean).map((t) => ({k: false, t}));
});
const dir = path.join(root, "game/engine/cards");
const defined = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith(".json") && !f.endsWith(".scenarios.json")) { try { const j = JSON.parse(readFileSync(p, "utf8")); if (j.abilities && j.identity) defined.push(j.identity.name); } catch {} } } };
walk(dir);
const byName = new Map(oracle.map((c) => [c.name, c]));
for (const loose of [false, true, 2]) {
  const known = new Set();
  for (const n of defined) { const c = byName.get(n); if (c) for (const u of units(c, loose)) known.add(u.t); }
  let all = 0, full = 0, vanilla = 0, fullUndefined = 0, half = 0;
  for (const c of oracle) {
    if (/^(Basic Land|Token)/.test(c.type || "") || /Conspiracy|Scheme|Plane |Phenomenon|Vanguard|Dungeon|Attraction|Contraption/.test(c.type || "")) continue;
    all++;
    const us = units(c, loose);
    if (us.length === 0) { vanilla++; full++; if (!tableCards(c.name)) fullUndefined++; continue; }
    const hit = us.filter((u) => u.k || known.has(u.t)).length;
    if (hit === us.length) { full++; if (!tableCards(c.name)) fullUndefined++; }
    if (hit / us.length >= 0.5) half++;
  }
  console.log(JSON.stringify({mode: loose === 2 ? "numbers, colors, types, keywords generalized" : loose ? "numbers generalized" : "exact sentences", knownSentences: known.size, cards: all, everySentenceKnown: full, share: (100 * full / all).toFixed(1) + "%", ofThoseUndefinedToday: fullUndefined, vanilla, halfOrMoreKnown: half}));
}
// The 90% target's undefined cards, on the same measure.
{
  const {topCards} = await import(path.join(root, "game/tools/engine-top-cards.mjs"));
  const graph = JSON.parse(readFileSync(path.join(root, "data/graph.json"), "utf8"));
  const played = JSON.parse(readFileSync(path.join(root, "data/graph-played.json"), "utf8"));
  const {cards} = topCards({graph, played, share: 0.9});
  for (const loose of [false, true, 2]) {
    const known = new Set();
    for (const n of defined) { const c = byName.get(n); if (c) for (const u of units(c, loose)) known.add(u.t); }
    let undef = 0, full = 0, noOracle = 0;
    for (const t of cards) {
      if (tableCards(t.name)) continue;
      undef++;
      const c = byName.get(t.name);
      if (!c) { noOracle++; continue; }
      const us = units(c, loose);
      if (us.every((u) => u.k || known.has(u.t))) full++;
    }
    console.log(JSON.stringify({target: "90%", mode: loose === 2 ? "numbers, colors, types, keywords generalized" : loose ? "numbers generalized" : "exact", undefinedInTarget: undef, everySentenceKnown: full, share: (100 * full / undef).toFixed(1) + "%", noOracleMatch: noOracle}));
  }
}
