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
  /* M-12 held the sticky nav in its own track so it could not ride over the library note. The
     note itself is gone (Rob, 24 September: "Your cards, your library saved in this browser.
     Export a backup ... None of that should be there") -- a signed-in library lives in the cloud,
     and the card data's age is in Menu -- so the rail is the nav track and Menu at its foot. */
  for (const f of ["index.html", "crankmagic.html"]) {
    const src = read(f);
    ok(/<div class="v-nav-track"><nav class="v-nav-links"/.test(src), `${f}: the sticky nav lives in its own track (M-12)`);
    ok(!/cm-nav-note|cm-data-age|Your cards\. Your library\./.test(src), `${f}: the rail carries no "saved in this browser" note, no data age and no Back up now`);
    ok(/<\/nav><\/div>\s*<div class="cm-rail-foot">/.test(src), `${f}: Menu sits at the rail's foot, straight under the nav track (M-12, Track V.3)`);
    ok(!/Subscribe to updates|data-action="mirror"|data-action="load-live"/.test(src), `${f}: Menu no longer offers Subscribe to updates, a mirrored file or Load Live`);
  }
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

/* Track V.1b, and r3's three choices: the theme is a saved preference the shell applies -- dark,
   light, or the device's own setting -- and the Menu offers all three. */
{
  const app = read("crankmagic-app.js");
  ok(/function applyTheme\(\)\{const choice=themeChoice\(\),shown=choice==='system'\?\(lightQuery\.matches\?'light':'dark'\):choice;document\.getElementById\('matrix-v2'\)\.dataset\.theme=shown;/.test(app), "applyTheme sets #matrix-v2's theme from the saved choice, resolving Match system");
  ok(/describeData\(\);applyTheme\(\);/.test(app), "render applies it");
  ok(/lightQuery\.addEventListener\('change',\(\)=>\{if\(themeChoice\(\)==='system'\)applyTheme\(\);\}\)/.test(app), "and Match system follows the device live");
  ok(/actions\['set-theme'\]/.test(app) && !/actions\['toggle-theme'\]/.test(app), "the Menu sets a theme rather than flipping one");
  for (const f of ["index.html", "crankmagic.html"])
    for (const choice of ["dark", "light", "system"])
      ok(new RegExp(`data-action="set-theme" data-theme-choice="${choice}" aria-pressed=`).test(read(f)), `${f}: the menu offers the ${choice} theme`);
  ok(!/--v-[a-z]+:light-dark\(/.test(read("crankmagic-design.css")), "no legacy token carries its own colors; all read the Gallery tokens");
}

/* Track V.1c: the mana pips are read from the tokens, not hard-coded in JavaScript (revision 2
   INTAKE, item 4). crankmagic-decks.js carried `const PIP={W:'#fff0b4',U:'#53acff',...}` -- five
   literals of the pre-Gallery palette that no theme switch could reach, so a deck tint and a pip
   disagreed in light mode and neither followed the designer's values. They come from
   getComputedStyle on #matrix-v2 now, which is also what makes --tint per tile possible. */
{
  const decks = read("crankmagic-decks.js");
  const literals = (decks.match(/#fff0b4|#53acff|#696076|#ee735f|#66b889/g) || []);
  eq(literals, [], `crankmagic-decks.js still hard-codes the old pip colors: ${literals.join(", ")}`);
  ok(/getComputedStyle/.test(decks), "crankmagic-decks.js reads its colors from the computed tokens");
  ok(/--mana-/.test(decks), "and names the --mana-* tokens when it does");
  /* Read once and cached, not per pip: a getComputedStyle inside a render loop over a hundred
     rows is a forced reflow per card, which is how a list gets slow without anything looking wrong. */
  ok(/function pips?\b|const pip|let PIP|function manaColors?\b/.test(decks), "the lookup is a named function, so it has somewhere to cache");
}

/* Track V.4a: the deck tiles, replaced wholesale (the guide's step 3, against
   screens/Gallery Decks.dc.html). The old tile was a bordered panel with the art at the top, a
   text block under it and a footer row; the Gallery tile is a 3:4 poster with the art behind
   everything, the stage as a pill rather than a colored border, and one tint per deck taken from
   the commander's first color. These read the source for the properties the guide names by
   number, so a later edit that quietly restores a border or a footer fails here. */
{
  const css = read("crankmagic.css"), decks = read("crankmagic-decks.js");
  const tile = (css.match(/\.cm-deck-tile\{[^}]*\}/) || [""])[0];
  ok(/aspect-ratio:3\/4/.test(tile), "the tile is a 3:4 poster");
  ok(/border-radius:var\(--v-radius-tile\)/.test(tile), "at the tile radius");
  ok(/border:0/.test(tile), "with no border of its own -- the stage is the pill, not the frame");
  /* The screen draws three across, and three is what a 260px minimum lays in the ~1010px a
     1280 window leaves after the rail and the padding. It is written as auto-fill rather than
     as the number 3 so a wider window gets a fourth and a fifth tile instead of three enormous
     ones, and so zooming out reflows rather than only shrinking the text (Rob, 2026-09-20).
     Holding the literal 3 here would hold the defect. */
  ok(/grid-template-columns:repeat\(auto-fill,minmax\(260px,1fr\)\)/.test((css.match(/\.cm-deck-grid\{[^}]*\}/) || [""])[0]), "the grid fits as many tiles as the width allows, from a 260px tile");
  /* The stage-colored borders are dropped. A .cm-stage-* rule that sets a border or its color
     is the old frame coming back. */
  const stageBorders = [...css.matchAll(/\.cm-stage-(?:defining|building|playable|complete|archived)\b[^{}]*\{([^}]*)\}/g)].map((m) => m[1]).filter((body) => /border(-[a-z]+)?-?color:|border:/.test(body));
  eq(stageBorders, [], `a .cm-stage-* rule still paints a border: ${stageBorders.join(" | ")}`);
  /* Every tile names its tint, and names it as a token rather than a literal. */
  ok(/--tint:var\(--mana-/.test(decks), "each tile carries --tint from the commander's first color, as a --mana-* token");
  ok(!/<footer>/.test(decks.slice(decks.indexOf("cm-deck-tile"), decks.indexOf("cm-deck-tile") + 2600)), "the tile's footer row is gone; the bracket and the menu ride the poster");
  /* The toolbar becomes a summary line in the page head and two links under the grid. */
  ok(/cm-decks-summary/.test(decks), "the page head carries the computed summary line");
  ok(/cm-deck-footlinks/.test(decks), "and How a deck comes together and Show archived sit under the grid");
  ok(/cm-deck-new/.test(decks), "the last grid cell is the dashed New deck tile");
}

/* Track V.4b: the deck page (the guide's step 4, against screens/Gallery Deck Page.dc.html).
   The hero puts the commander's card beside the copy; the tabs become a segmented control; and
   the Progress and Cost panel plus The hundred at a glance become one six-column bento, so the
   page is a set of cards of known spans rather than a stack of full-width panels. The figures are
   the same figures -- readiness and the rules module -- laid out differently. */
{
  const css = read("crankmagic.css"), decks = read("crankmagic-decks.js");
  ok(/cm-deck-hero-card/.test(decks), "the hero carries the commander's card beside the copy");
  ok(/rotate\(-3deg\)/.test(css), "tilted, as the screen has it");
  ok(/cm-deck-chips/.test(decks), "the mechanics read as chips rather than a run-on line");
  ok(/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/.test((css.match(/\.cm-bento\{[^}]*\}/) || [""])[0]), "the bento is six columns");
  /* Every card the guide names, by the span it names. A card that loses its span has become a
     full-width panel again, which is the layout this step replaced. */
  for (const [cls, span] of [["next", 6], ["progress", 3], ["cost", 3], ["curve", 2], ["types", 2], ["purpose", 2], ["plays", 4], ["upgrade", 2], ["record", 6]]) {
    const rule = (css.match(new RegExp("\\.cm-bento-" + cls + "\\{[^}]*\\}")) || [""])[0];
    ok(new RegExp("grid-column:span " + span).test(rule), `the ${cls} card spans ${span} (found ${rule || "no rule"})`);
  }
  /* The nine cards are drawn by one helper that builds its class from the key, so the class
     names are not in the source to grep for -- the keys are, as the helper's first argument. */
  const built = [...decks.matchAll(/\bcard\('([a-z]+)'/g)].map((m) => m[1]);
  const drawn = new Set([...built, ...[...decks.matchAll(/cm-bento-([a-z]+)/g)].map((m) => m[1])]);
  const missing = ["next", "progress", "cost", "curve", "types", "purpose", "plays", "upgrade", "record"].filter((k) => !drawn.has(k));
  eq(missing, [], `crankmagic-decks.js does not draw these bento cards: ${missing.join(", ")}`);
  ok(/cm-ring/.test(decks) && /<svg/.test(decks), "Progress is a ring, not a bar");
  ok(/cm-tabs-segment/.test(css), "the tabs are a segmented control");
}

/* Track V.4c: the Library (the guide's step 4, against screens/Gallery Library.dc.html). The
   seven counts were a wrapping ribbon of chips; they are a row of equal tiles now, each with its
   figure in its status color over a dot and a label, and one caption line under them stating the
   equation the seven figures make -- which is the guide's "Counts as tiles, not a ribbon", and
   the reason the row could be read as a sentence rather than counted. The table keeps its
   behaviour and gains the card, the uppercase header and rows that do not wrap. */
{
  const css = read("crankmagic.css"), col = read("crankmagic-collection.js");
  /* By content, not by the first .cm-kpis in the file: the narrow breakpoints override the
     column count, and matching the first rule found the four-column phone one. */
  /* The card states (docs/card-states.md, 2026-09-26): eight tiles in two rows of four, the stages over where an owned card is. */
  const tiles = (css.match(/\.cm-kpis\{display:grid;[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)[^}]*\}/) || [""])[0];
  ok(tiles, "the counts are two rows of four equal tiles");
  ok(/STAT_FIGURES=\[\['watching','Watching'[^\n]*\['toadd','To add'[^\n]*\['substitute','Substitute'/.test(col), "the stages, then Bench, To add, Target, Substitute");
  ok(/gap:8px/.test(tiles), `at the guide's gap (found ${tiles || "no rule"})`);
  ok(/cm-kpi-caption">[^`]*Owned = Bench \+ To add \+ Target \+ Substitute · To buy: /.test(col), "and one caption line states the equation, Owned = Bench + To add + Target + Substitute, and how To buy divides");
  ok(/font-family:var\(--v-display\)/.test((css.match(/\.cm-kpi strong\{[^}]*\}/) || [""])[0]), "the figure is in the display face");
  /* The head's summary sentence, through the same pageHead the deck pages use. */
  ok(/cm-cards-summary/.test(col), "the Library head carries its summary sentence");
  /* Rows that never wrap (README, "Rows are one line tall"), and the table as a panel card. */
  const row = (css.match(/#cm-roster-table tbody tr\{[^}]*\}/) || [""])[0];
  ok(/min-height:56px/.test(row) || /height:56px/.test(row), `table rows are 56px (found ${row || "no rule"})`);
  ok(/white-space:nowrap/.test((css.match(/#cm-roster-table tbody td\{[^}]*\}/) || [""])[0]), "and their cells ellipsize rather than wrapping");
  /* V.4f, the second pass: the card cell carries the card's own mana, and its Primary Purpose
     is a chip under the name rather than a run of small grey text. The name comes first and the
     mana after it (Rob, 2026-09-25), so a narrow column never spends the name's room on symbols. */
  ok(/cm-row-mana/.test(col), "every row shows the card's mana");
  ok(/<\/button>\$\{rowMark\(r\.card\)\}/.test(col) && !/\$\{rowMark\(r\.card\)\}<button class="cm-card-name"/.test(col), "after the card's name, not before it");
  ok(/cm-row-land/.test(col), "and a land, which has no mana cost, gets its own mark");
  ok(/cm-purpose-chip/.test(col), "the Primary Purpose reads as a chip");
  ok(/--band:/.test(col), "and a group band is tinted by the scope it bands");
}

/* Track V.4d: the Explore entry (the guide's step 4, against screens/Gallery Explore Entry.dc.html).
   The three doors existed as three buttons in a row under a one-line intro; they are three cards
   now, each carrying its own color, under the sentence that says what the page is for. The
   actions behind them are unchanged -- this is the entry read as an invitation rather than as a
   toolbar. */
{
  const css = read("crankmagic.css"), disc = read("crankmagic-discover.js");
  ok(/cm-explore-eyebrow/.test(disc), "the entry opens with the EXPLORE eyebrow");
  ok(/cm-explore-head/.test(disc) && /cm-explore-search/.test(disc), "a heading beside its own search field");
  const doors = (css.match(/\.cm-explore-doors\{[^}]*\}/) || [""])[0];
  ok(/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/.test(doors), `the doors are three cards (found ${doors || "no rule"})`);
  const door = (css.match(/\.cm-explore-door\{[^}]*\}/) || [""])[0];
  ok(/min-height:300px/.test(door), "at the screen's height");
  ok(/border-radius:20px|border-radius:var\(--v-radius-tile\)/.test(door), "and its radius");
  /* Each door carries its own hue -- the buy color, the inbox color, the aether -- so the three
     are told apart by more than their words. */
  ok(/--door:/.test(disc), "each door names its own color");
  ok(/Pick up where you left off/.test(disc), "and the recent scopes are an invitation, not a label");
  /* V.4e, the second pass: the other two doors carry something to look at, the sub-line says how
     big the graph is, and the roles are pills with their counts. */
  ok(/cm-door-fan/.test(disc), "the commander door fans the commanders it would open on");
  ok(/cm-door-graph/.test(disc), "the card door shows a graph rather than describing one");
  ok(/cm-explore-roles/.test(disc), "and the entry offers the role lenses with their counts");
  /* The graph pane's head is the screen's 118px of art beside the text, not 150px. At 150 the
     text column came out 122px wide in a 338px pane and the card's name broke inside a word --
     "Quintorius, Loremaster" rendered as four line boxes ending "Loremaste" over "r". Rob saw it
     in a render. The wrap property was already right; the column was the cause. */
  ok(/--cm-art-w:clamp\(118px/.test(css), "the card pane's art column starts at the screen's 118px, so the name has room to break at a space");
  ok(/CrankFacets\.values/.test(disc), "the role counts are the facet module's, not counted again here");
}

/* AMERICAN ENGLISH, ALWAYS (Rob, 2026-09-20; AGENTS.md). The design handoff arrived in UK spelling and it
   leaked into this repository's own writing. Every tracked document, test, stylesheet and script
   is American English; the designer's verbatim handoff folder (docs/design/.../design_handoff_*) is
   source material and exempt. The count below is the legacy total on the day the rule landed; it
   only goes down, and a commit that adds a UK spelling anywhere fails here by file and word. */
{
  const {execFileSync} = await import("node:child_process");
  const UK = /\b(colour|colours|coloured|centre|centred|recognise|recognised|recognises|normalise|normalised|honour|honours|favour|favourite|grey|licence|organise|organised|analyse|cancelled|behaviour|catalogue|towards|defence|programme|artefact|artefacts|initialise|serialise|customise|minimise|optimise|summarise|visualise|prioritise|realise|utilise|authorise|neighbour|flavour|labour|humour|theatre|metre|litre|manoeuvre|jewellery|travelling|modelling|labelled|signalling|fulfil|enrol|instalment|skilful|ageing|judgement|acknowledgement|amongst|whilst)\b/gi;
  const tracked = execFileSync("git", ["ls-files", "--", "*.md", "*.mjs", "*.js", "*.css", "*.html"], {cwd: ROOT, encoding: "utf8"}).split(/\r?\n/).filter((f) => f && !f.includes("design_handoff_") && !(f.startsWith("docs/uat/") && f.split("/").length > 3) && f !== "tests/feature-wiring.mjs" /* the word list lives here */ && f !== "docs/design/BRIEF.md" /* and the designers' "never write" column */);
  let total = 0; const byFile = [];
  /* Two event names the Java engine adapter emits (ForgeBrowserBridge.java) keep their spelling: they are
     protocol, not prose, and a journal written before today carries them. Nothing else is exempt. */
  const PROTOCOL = /browser-cast-cancelled|cancelled-model-request/g;
  const EMAIL = /\be-mails?\b|\be-mailed\b/gi;   // US usage is "email"
  for (const f of tracked) { const text = readFileSync(path.join(ROOT, f), "utf8").replace(PROTOCOL, ""); const n = (text.match(UK) || []).length + (text.match(EMAIL) || []).length; if (n) { total += n; byFile.push(`${f} (${n})`); } }
  /* 586 on the day the rule landed; 563 after V.1c, which rewrote enough stylesheet and deck-file
     prose to take twenty-three with it; 530 after the pass before the first production release
     (2026-09-24), which took every UK spelling in the app's own on-screen words away -- "Colour
     identity within" on Build, "Any colour" in the Library filter, the tour's copy, the
     canceled-order messages -- and #290's four strings with them. Card names are printed names and
     keep their spelling (Gandalf the Grey, Ultramarines Honour Guard). Lower it whenever a change
     takes it lower, the way the hex ceiling works. What is left is legacy prose in comments and
     documents. */
  /* An archived UAT run under docs/uat/<run>/ is someone else's record, kept verbatim like a designer's
     handoff (design_handoff_ above): Grok Bot's harness carries a UK-word list because it checks the app
     for them. Our own prose, docs/uat/*.md included, still counts. */
  /* 2026-09-25, Rob: "Stop defaulting to Europe stuff." Every one of them went: 530 UK spellings (and 58 "e-mail"s)
     rewritten the US way across the repository's own files, card names protected by their printed
     spelling. It is a hard zero now, not a ceiling. */
  const CEILING = 0;
  ok(total <= CEILING, `UK spellings in tracked files: ${total}, ceiling ${CEILING} (only goes down). Files: ${byFile.slice(0, 8).join(", ")}`);
  /* and nothing written today carries one */
  for (const f of ["docs/design-intake-2026-09-20.md", "docs/handoff-fable-2026-09-20.md", "docs/design/2026-09-20-deck-page/INTAKE.md", "tests/design-tokens.mjs", "crankmagic-design.css"]) {
    const hits = (read(f).match(UK) || []);
    eq(hits, [], `${f} carries UK spellings: ${hits.join(", ")}`);
  }
}

/* THE UNITED STATES, ALWAYS (AGENTS.md; Rob, 2026-09-25: "I NEVER WANT ANYTHING, grammar, currency, etc.
   from anywhere except The US"). Three holds, each a hard zero rather than a ratchet:
   1. every number and date formatter names 'en-US', so a reader's browser locale never turns 1,024 into
      1.024 or Sep 25 into 25 Sept;
   2. no raw timestamp or ISO date is printed into a page -- dates go through usDate / usDateTime;
   3. nothing that ships carries another currency. */
{
  const {execFileSync} = await import("node:child_process");
  const scripts = execFileSync("git", ["ls-files", "--", "*.js", "*.mjs"], {cwd: ROOT, encoding: "utf8"}).split(/\r?\n/)
    .filter((f) => f && !/^(docs|design|data|tests)\//.test(f));   // tests may probe another locale on purpose
  const bare = [];
  for (const f of scripts) {
    const code = read(f);
    for (const m of code.matchAll(/toLocale(?:Date|Time)?String\(([^)]{0,40})|Intl\.(?:NumberFormat|DateTimeFormat|RelativeTimeFormat|PluralRules|ListFormat)\(([^)]{0,40})/g))
      if (!/^\s*['"]en-US['"]/.test(m[1] ?? m[2] ?? "")) bare.push(`${f}: ${m[0].slice(0, 40)}`);
  }
  ok(bare.length === 0, `every toLocale*String and Intl formatter names 'en-US' (${scripts.length} scripts read); these do not: ${bare.slice(0, 8).join(" | ")}`);
  const pages = ["crankmagic-app.js", ...features];
  const raw = pages.flatMap((f) => [...read(f).matchAll(/\$\{(?:e|esc|C\.esc)\((?:String\()?[\w.?]*\.(?:at|savedAt|createdAt|updatedAt|importedAt|playedAt|rankDate)\)?(?:\.slice\(0, ?1[06]\))?\)\}/g)].map((m) => `${f}: ${m[0]}`));
  ok(raw.length === 0, `no raw timestamp or ISO date is printed into a page; dates go through usDate/usDateTime: ${raw.join(" | ")}`);
  ok(/const usDate=v=>\{const t=M\.localDate\(v\);return t\?t\.toLocaleDateString\('en-US'/.test(read("crankmagic-app.js")), "usDate writes a date the US way");
  const shipped = execFileSync("git", ["ls-files", "--", "*.js", "*.html", "*.css"], {cwd: ROOT, encoding: "utf8"}).split(/\r?\n/)
    .filter((f) => f && !/^(docs|design|data|tests|game|tools|graph|sim)\//.test(f));
  const foreign = shipped.filter((f) => /\bEUR\b|\bGBP\b|\beur\b|\btix\b|€|£|¥/.test(read(f)));
  ok(foreign.length === 0, `nothing that ships carries another currency (${shipped.length} files read): ${foreign.join(", ")}`);
  /* SIZES ARE SLIDERS, NEVER STEPS (AGENTS.md; Rob, 2026-09-26). No size is picked from S / M / L or a row of size
     buttons in anything that ships, the Play game's pages included: a size control is an <input type="range">,
     proved at both ends by tests/card-size.mjs. */
  const ui = execFileSync("git", ["ls-files", "--", "game/ui/*.mjs", "game/ui/*.html"], {cwd: ROOT, encoding: "utf8"}).split(/\r?\n/).filter(Boolean);
  const STEPS = /\[\s*['"]S['"]\s*,\s*['"]M['"]\s*,\s*['"]L['"]\s*\]|data-size=|role="group"[^>]*aria-label="[^"]*\bsize\b|aria-label="[^"]*\bsize\b"[^>]*role="group"/i;
  const stepped = [...shipped, ...ui].filter((f) => STEPS.test(read(f)));
  ok(stepped.length === 0, `no size is picked from steps in anything that ships (${shipped.length + ui.length} files read): ${stepped.join(", ")}`);
}

console.log(`feature-wiring: ${checks} checks passed — ${features.length} feature files read; dialogs bound, help entries titled, dates local, compare picks in memory.`);
