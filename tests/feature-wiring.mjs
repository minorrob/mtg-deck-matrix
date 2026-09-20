/* FEATURE WIRING, HELD BY READING THE SOURCE.
 *
 * Four defects from the 2026-09-19 walkthrough (docs/app-walkthrough-plan-2026-09-19.md, W.1)
 * shared one shape: a feature file did something the app's plumbing cannot honor, and nothing
 * failed until a person clicked. New deck threw "dialog is not defined" because the decks feature
 * never receives the dialog handle; Play's help printed `undefined` because one entry was a bare
 * string where the registry wants {title, body}; Log a game defaulted to tomorrow because the date
 * was UTC; a compare tick was dropped because a view selection went through the serialized save.
 *
 * A feature file is a CrankFeatures registration that wants a DOM and a `C`, so it is read here
 * rather than run. Each check names the defect it holds shut.
 */
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import path from "node:path";
import {ROOT} from "../schema/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const read = (f) => readFileSync(path.join(ROOT, f), "utf8");
const features = readdirSync(ROOT).filter((f) => /^crankmagic-.*\.js$/.test(f) && f !== "crankmagic-app.js" && f !== "crankmagic-sw.js").sort();

/* D1. A feature that touches `dialog` must have bound it: destructured from C, assigned from
   modal(), or looked up. The app's own dialog lives in crankmagic-app.js and is not exported. */
{
  const unbound = features.filter((f) => {
    const src = read(f);
    /* a method call on it, not the word "dialog." at the end of a sentence in a comment */
    if (!/\bdialog\.(close|showModal|show|open\b|innerHTML|querySelector|scrollTop|setAttribute|addEventListener)/.test(src)) return false;
    return !/(const|let|var)\s*\{[^}]*\bdialog\b[^}]*\}\s*=\s*C\b|(const|let|var)\s+dialog\s*=|\bdialog\s*=\s*(modal|form|C\.\$|\$)\(/.test(src);
  });
  eq(unbound, [], `these features use a dialog they never bound, which throws "dialog is not defined" at the click: ${unbound.join(", ")}`);
}

/* D2. Every help entry is {title, body}: the "?" button reads both. */
{
  const bad = [];
  for (const f of features) {
    for (const m of read(f).matchAll(/\bHELP\.([a-zA-Z]+)\s*=\s*([`'"{])/g)) if (m[2] !== "{") bad.push(`${f}: HELP.${m[1]} is a bare string`);
  }
  eq(bad, [], `a help entry without a title prints "undefined" over the dialog:\n  ${bad.join("\n  ")}`);
  const keys = new Set();
  for (const f of features) for (const m of read(f).matchAll(/\bHELP\.([a-zA-Z]+)\s*=\s*\{/g)) keys.add(m[1]);
  for (const key of ["decks", "deck", "cards", "lab", "discover", "game", "change"]) ok(keys.has(key), `HELP.${key} is registered as an object`);
}

/* D4. A date a person sees is the local calendar date, from one helper. The UTC slice is fine for
   data stamps that are compared across machines (card-catalog.js keeps it); it is wrong for the
   date a game was played, the name of a backup, the date on an export. */
{
  const utc = /new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)/;
  for (const f of ["crankmagic-decks.js", "crankmagic-app.js", "crankmagic-collection.js"]) ok(!utc.test(read(f)), `${f} builds a user-facing date from UTC; use M.today()`);
  ok(/\btoday\b/.test(read("collection-model.js")) && /M\.today\(\)/.test(read("crankmagic-decks.js")), "Log a game defaults to M.today()");
}

/* D9. A compare tick is a view selection, not a library change: it never goes through commit(),
   which refuses a second call while the first is saving and which persists across reloads. */
{
  const advisor = read("crankmagic-advisor.js");
  const handler = /actions\['compare-pick'\]\s*=([^\n]*)/.exec(advisor);
  ok(handler, "the compare-pick handler is in crankmagic-advisor.js");
  ok(!/commit\(/.test(handler[1]), "and it does not commit a preferences command");
  ok(!/preferences\.comparisonPicks/.test(read("crankmagic-decks.js")), "the Decks page reads the picks from memory, not from saved preferences");
}

/* M-11. No tracked text file carries U+FFFD. The replacement character is what a decoder writes
   when bytes were read in the wrong encoding; committed, it is a corrupted word shipped to every
   reader (the tab title read "CrankMagic", the replacement character, "Commander workshop" for
   three days). This file spells the character by its code so it does not flag itself. */
{
  const {execFileSync} = await import("node:child_process");
  const tracked = execFileSync("git", ["ls-files", "--", "*.html", "*.js", "*.mjs", "*.css", "*.md", "*.json"], {cwd: ROOT, encoding: "utf8"}).split(/\r?\n/).filter(Boolean);
  const corrupted = tracked.filter((f) => readFileSync(path.join(ROOT, f), "utf8").includes(String.fromCharCode(0xFFFD)));
  eq(corrupted, [], `these tracked files carry U+FFFD, a decoding error committed as text: ${corrupted.join(", ")}`);
  ok(tracked.length > 100, `the tracked-file list is real (${tracked.length} files)`);
}

/* B-20, M-14, M-16, P-05: the small UAT fixes, held by reading the source. */
{
  const decks = read("crankmagic-decks.js"), app = read("crankmagic-app.js");
  ok(/primary=readyN>0\?'pull':ready\.toBuy>0\?'buy':'log'/.test(decks), "the deck header's primary follows the deck's state (B-20)");
  ok(/M\.localDate\(g\.at\)/.test(decks) && /\blocalDate\b/.test(read("collection-model.js")), "a game's date is read as a local calendar date (P-05)");
  ok(/paidOrList\/wins/.test(decks), "paid per win divides the figure the Cost panel shows (P-05)");
  ok(/closeBtn\.focus\(\{preventScroll:true\}\);dialog\.scrollTop=0/.test(app), "a dialog opens at the top with focus on its close button (M-14)");
  ok(/hashchange[\s\S]{0,400}stale\.hidden=true/.test(app), "a notice is hidden when the route changes (M-16)");
  for (const [f, rule] of [["crankmagic.css", /#cm-dialog\{[^}]*overflow:hidden auto/], ["crankmagic-design.css", /dialog\.v-dialog\{[^}]*overflow:hidden auto/]]) ok(rule.test(read(f)), `${f}: the dialog never scrolls sideways (M-13)`);
  for (const f of ["index.html", "crankmagic.html"]) ok(/<div class="v-nav-track"><nav class="v-nav-links"/.test(read(f)) && /<\/nav><\/div><div class="cm-nav-note"/.test(read(f)), `${f}: the sticky nav lives in its own track above the note (M-12)`);
}

/* M-15 and M-02, Rob's decisions of 2026-09-20, held by reading the source. */
{
  ok(/kind: 'lobby'/.test(read("collection-lobby-draft.js")), "the lobby mints a lobby deck (M-15)");
  const decks = read("crankmagic-decks.js");
  ok(/C\.showLobbyDecks\|\|!M\.isLobbyDeck\(d\)/.test(decks), "the tiles hide lobby decks unless Show lobby decks is on");
  ok(/promote-lobby-deck/.test(decks) && /type:'editDeck',deckId:d\.id,kind:'deck'/.test(decks), "Save to Decks promotes one");
  ok(/C\.showLobbyDecks\|\|!M\.isLobbyDeck\(d\)/.test(read("crankmagic-collection.js")), "the library rows and counts leave hidden lobby decks out");
  ok(/C\.showLobbyDecks\|\|!M\.isLobbyDeck\(x\)/.test(read("crankmagic-lab.js")), "the Lab's Existing deck select leaves them out");
  ok(/paidSource==='catalog'\?`<span class="cm-muted cm-paid-list"/.test(read("crankmagic-collection.js")), "a catalog-sourced paid figure shows as approximate, labeled catalog (M-02)");
  ok(!/recorded as paid/.test(read("crankmagic-collection.js")), "and no toast calls a catalog stamp 'paid'");
  ok(/l\.paidSource==='catalog'\?'≈ ':''/.test(read("crankmagic-orders.js")), "the order lines say so too");
  ok(/paidSource==='catalog'\),/.test(decks), "and the deck's Paid so far counts it as an estimate");
}

/* Track V.1b: the theme is a saved preference the shell applies, and User Functions can switch it. */
{
  const app = read("crankmagic-app.js");
  ok(/dataset\.theme=state\.preferences&&state\.preferences\.theme==='light'\?'light':'dark'/.test(app), "render applies the saved theme to #matrix-v2");
  ok(/actions\['toggle-theme'\]/.test(app), "and User Functions can switch it");
  for (const f of ["index.html", "crankmagic.html"]) ok(/data-action="toggle-theme"/.test(read(f)), `${f}: the menu carries the theme switch`);
  ok(!/--v-[a-z]+:light-dark\(/.test(read("crankmagic-design.css")), "no legacy token carries its own colors; all read the Gallery tokens");
}

/* AMERICAN ENGLISH ON SCREEN. The ceiling below sweeps every tracked file, prose and all;
   this holds the subset a reader actually sees -- labels, help bodies, warnings, the count
   under the commander picker, an aria-label. Each surface is named by the exact text that
   reaches the DOM and by the British spelling it replaced, so a spelling put back into one
   of them fails here by surface rather than by count. Found by reading every string literal
   in the shipped scripts; comments are the ceiling's business, not this one's. */
{
  const onScreen = [
    ["crankmagic-lab.js", "Colour identity within", "Color identity within", "Build: the commander picker's identity filter"],
    ["crankmagic-lab.js", "play style or colour'", "play style or color'", "Build: the count under Matching commanders"],
    ["crankmagic-lab.js", "play style, colour identity", "play style, color identity", "Build: the help body"],
    ["crankmagic-game.js", 'aria-label="Colour identity filter"', 'aria-label="Color identity filter"', "Play: the lobby identity filter, to a screen reader"],
    ["crankmagic-app.js", "It counts towards a deck", "It counts toward a deck", "the glossary entry for Ordered"],
    ["crankmagic-app.js", "its type, its colour, what it is for", "its type, its color, what it is for", "the glossary entry for Group piles by"],
    ["crankmagic-collection.js", "in the same colour wherever it appears", "in the same color wherever it appears", "Library: the help lede"],
    ["crankmagic-collection.js", "'Any colour'", "'Any color'", "Library: the table's Color filter"],
    ["crankmagic-discover.js", "is labelled one", "is labeled one", "Explore: the help body on the trace score"],
    ["crankmagic-discover.js", "inside the deck\\'s colours", "inside the deck\\'s colors", "Explore: the empty state under Could join it"],
    ["crankmagic-discover.js", "'outside the colour identity'", "'outside the color identity'", "Explore: why a candidate was refused"],
    ["crankmagic-change.js", "commander's colour identity.", "commander's color identity.", "the change warning for an off-identity card"],
    ["crankmagic-lobby.js", "'s colour identity (", "'s color identity (", "Play: the seat's identity issue"],
    ["crankmagic-sim.js", '"Measurement cancelled."', '"Measurement canceled."', "Build: the sim status line when a measurement is stopped"],
    ["collection-model.js", "' cancelled'", "' canceled'", "the note when ordered copies fall"],
    ["collection-model.js", "'Cancelled a pending acquisition", "'Canceled a pending acquisition", "the summary for removing a pending acquisition"],
    ["draft-builder.js", "no more in these colours", "no more in these colors", "Build: why a draft came in under its bracket"],
    ["scryfall-client.js", '"Request cancelled"', '"Request canceled"', "the abort message shown with a failed fetch"]
  ];
  for (const [file, uk, us, where] of onScreen) {
    const src = read(file);
    ok(src.includes(us), `${where} (${file}) must read "${us}"`);
    ok(!src.includes(uk), `${where} (${file}) still carries "${uk}"`);
  }
}

/* AMERICAN ENGLISH, ALWAYS (Rob, 2026-09-20; AGENTS.md). The design handoff arrived in UK spelling and it
   leaked into this repository's own writing. Every tracked document, test, stylesheet and script
   is American English; the designer's verbatim handoff folder (docs/design/.../design_handoff_*) is
   source material and exempt. The count below is the legacy total on the day the rule landed; it
   only goes down, and a commit that adds a UK spelling anywhere fails here by file and word. */
{
  const {execFileSync} = await import("node:child_process");
  const UK = /\b(colour|colours|coloured|centre|centred|recognise|recognised|recognises|normalise|normalised|honour|honours|favour|favourite|grey|licence|organise|organised|analyse|cancelled|behaviour|catalogue|towards|defence|programme|artefact|artefacts|initialise|serialise|customise|minimise|optimise|summarise|visualise|prioritise|realise|utilise|authorise|neighbour|flavour|labour|humour|theatre|metre|litre|manoeuvre|jewellery|travelling|modelling|labelled|signalling|fulfil|enrol|instalment|skilful|ageing|judgement|acknowledgement|amongst|whilst)\b/gi;
  const tracked = execFileSync("git", ["ls-files", "--", "*.md", "*.mjs", "*.js", "*.css", "*.html"], {cwd: ROOT, encoding: "utf8"}).split(/\r?\n/).filter((f) => f && !f.includes("design_handoff_") && f !== "tests/feature-wiring.mjs" /* the word list lives here */);
  let total = 0; const byFile = [];
  for (const f of tracked) { const n = (readFileSync(path.join(ROOT, f), "utf8").match(UK) || []).length; if (n) { total += n; byFile.push(`${f} (${n})`); } }
  const CEILING = 566;   /* 586 on the day the rule landed; 566 once the on-screen strings above were converted */
  ok(total <= CEILING, `UK spellings in tracked files: ${total}, ceiling ${CEILING} (only goes down). Files: ${byFile.slice(0, 8).join(", ")}`);
  /* and nothing written today carries one */
  for (const f of ["docs/design-intake-2026-09-20.md", "docs/handoff-fable-2026-09-20.md", "docs/design/2026-09-20-deck-page/INTAKE.md", "tests/design-tokens.mjs", "crankmagic-design.css"]) {
    const hits = (read(f).match(UK) || []);
    eq(hits, [], `${f} carries UK spellings: ${hits.join(", ")}`);
  }
}

console.log(`feature-wiring: ${checks} checks passed — ${features.length} feature files read; dialogs bound, help entries titled, dates local, compare picks in memory.`);
