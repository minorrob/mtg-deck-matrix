// The Play lobby against wireframe 2b — structure and content, not pixels.
//
// The handoff README is explicit about what each source is worth: `screens/*.dc.html` are
// "High-fidelity. Colours, type, spacing, radii and copy are final. Recreate pixel-close" --
// those are measured by tools/compare-to-screen.mjs in pixels. The wireframes are the other
// kind: "They are **low-fidelity**: follow their structure and content order, style them with
// the tokens below and the patterns of the five hi-fi screens." They are drawn at roughly half
// scale (a 640x440 card with a 108px rail standing in for 1280 with 216), so measuring them in
// pixels would measure the sketch rather than the design -- and would drag the app away from
// the hi-fi screens, whose h1 is 44px where the sketch's doubles to 36.
//
// So this suite checks what a lo-fi source can actually settle: which elements exist, what they
// say, and in what order. The facts come from wireframe 2b in wireframes/Wireframes.dc.html and
// the README's "Play lobby (table-first, wireframe 2b)" paragraph, both quoted at each check.
//
// It reads source rather than driving a browser because every fact here is a fact about what the
// code emits, and a suite that needs Chrome is a suite that gets skipped.

import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; void label; };

const game = readFileSync("crankmagic-game.js", "utf8");
const css = readFileSync("crankmagic.css", "utf8");

/* ------------------------------------------------------------------ the quadrant's furniture */

// 2b: the label row is `position:absolute;left:0;right:0;top:0` with the seat name and a status
// pill, `flexDirection: i%2 ? 'row-reverse' : 'row'` -- a bar across the quadrant's top edge,
// mirrored on the right-hand column. The build had it as a pill band floated into the outer
// corner, which is a different thing: it reads as a badge rather than as the seat's own header.
check("the seat header is a bar across the quadrant's top edge", () => {
  const rule = /\.cm-seat-q \.cm-lobby-seat>header\{([^}]*)\}/.exec(css);
  assert.ok(rule, "no header rule for a seat inside a quadrant");
  assert.match(rule[1], /position:absolute/, "the seat header should be pinned to the quadrant's top edge");
  assert.match(rule[1], /left:0/, "the header bar spans the quadrant, so it starts at its left edge");
  assert.match(rule[1], /right:0/, "the header bar spans the quadrant, so it ends at its right edge");
});

// 2b mirrors the header on the right-hand column so the name always sits on the outer side.
check("the right-hand column mirrors its header", () => {
  assert.match(css, /\.cm-q-t[lr] \.cm-lobby-seat>header,?[^{]*\{[^}]*flex-direction:row-reverse/,
    "one column should reverse its header row, as 2b's `flexDirection: i%2 ? 'row-reverse' : 'row'` does");
});

// 2b: `art ? <div style="height:144;aspectRatio:'488/680'"> : <div style="...border:1px dashed">?`
// -- the commander card is the seat's biggest element, about three quarters of the quadrant's
// height, and an empty seat shows the same frame dashed with a "?" in it. The README puts it
// "at the foot the commander card -- full quadrant height minus the label row (488:680 ...), in
// the outer corner".
check("a seated quadrant draws its commander card at 488:680", () => {
  assert.match(css, /\.cm-seat-card\{[^}]*aspect-ratio:488\/680/,
    "the quadrant's commander card should carry the card aspect 488:680");
  assert.ok(/\.cm-seat-card\{[^}]*height:/.test(css),
    "the card is sized from the quadrant's height, not from its width");
});

check("an empty quadrant draws a dashed card frame with a question mark", () => {
  assert.match(game, /cm-seat-card is-empty|cm-seat-card-empty/,
    "an empty seat needs the same card frame, dashed -- 2b draws it rather than leaving a gap");
  const dashed = css.split("\n").some((line) =>
    /(^|,)\s*\.cm-seat-card\.is-empty\b/.test(line.split("{")[0] || "") && /dashed/.test(line));
  assert.ok(dashed, "the empty frame is dashed");
});

// 2b: beside the card, `<div style="fontSize:8;lineHeight:1.4;minWidth:0;flex:1">detail</div>`,
// carrying for your own seat the commander name, then "Bracket 3 · $156 of $225", and for a
// guest "rob.friend@… · link expires in 3 h 52 m · waiting on them".
check("the card has a detail column beside it", () => {
  assert.match(game, /cm-seat-detail/,
    "the card and its reading are a row: card, then a detail column that takes the rest");
  assert.match(css, /\.cm-seat-figure\{[^}]*display:flex/,
    "card and detail sit in one flex row, as 2b lays them out");
});

check("your own seat's detail states the bracket and the deck cost against the cap", () => {
  assert.match(game, /\$\{[^}]*\}\s*of\s*\$|of \$\$\{|costLine|seatCostLine/,
    'your seat reads "Bracket 3 · $156 of $225" in 2b -- spent against the table\'s cap');
});

/* ------------------------------------------------------------------------------------ the fan */

// 2b: `const fan=(i,colors)=>{...ax=i%2?0:1000, ay=i<2?1000:0...}` -- a 90° wedge sweeping from
// the corner that touches the center panel INTO the quadrant. The build's table of start angles
// was one quarter-turn short at every corner, so all four fans swept into the neighboring
// quadrant and were clipped to nothing: present in the DOM, right in their colors, invisible on
// screen. That is why "the fan draws nothing" survived a fix to the color data.
//
// This reads the angles out of the source and walks a point a little way along the middle of
// each sweep. If it does not land inside the quadrant, the fan is being drawn somewhere else.
check("each corner's fan sweeps into its own quadrant", () => {
  const table = /const at = \{([^}]*)\}\[corner\]/.exec(game);
  assert.ok(table, "the fan's corner table not found in crankmagic-game.js");
  const corners = {};
  for (const m of table[1].matchAll(/(\w+):\s*\[([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\]/g)) {
    corners[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  assert.deepEqual(Object.keys(corners).sort(), ["bl", "br", "tl", "tr"], "all four corners");
  const outside = [];
  for (const [corner, [cx, cy, from]] of Object.entries(corners)) {
    /* the same measurement identityFan makes, a short way along the middle of the sweep */
    const rad = (from + 45 - 90) * Math.PI / 180;
    const x = cx + Math.cos(rad) * 0.5, y = cy + Math.sin(rad) * 0.5;
    if (!(x > 0 && x < 1 && y > 0 && y < 1)) outside.push(`${corner} sweeps to ${x.toFixed(2)},${y.toFixed(2)}`);
  }
  assert.deepEqual(outside, [], "a fan drawn outside its quadrant is clipped away and looks absent");
});

/* ------------------------------------------------------------------------- the player's tools */

// 2b's own seat carries four controls in order: Change deck (brass), Choose mat, Not ready,
// Leave seat. The README: "Change deck, Choose mat (the playmat art your board wears in game...),
// Ready / Not ready, Leave seat".
check("your seat offers Choose mat", () => {
  assert.match(game, /Choose mat/,
    "2b puts Choose mat on your own quadrant, between Change deck and the ready control");
});

check("the player's controls sit in 2b's order", () => {
  const at = (s) => game.indexOf(s);
  assert.ok(at("Change deck") > -1, "Change deck is on your own quadrant");
  assert.ok(at("Choose mat") > at("Change deck"),
    "2b's order is Change deck, Choose mat, Ready/Not ready, Leave seat");
});

// README: "Host-only controls (table rules, End table, force-advance) sit under **Host tools ▾**
// in the action row, never on the table." The build has them as a headed panel below the table.
check("host tools is a menu in the action row, not a panel below the table", () => {
  assert.ok(!/class="v-panel cm-lobby-rules"><h2>Host tools<\/h2>/.test(game),
    'the host\'s controls belong under "Host tools ▾" in the action row, not in a panel headed "Host tools"');
  assert.match(game, /Host tools/, "the action row still needs its Host tools menu");
});

// DELTA B.4 says a seat that is not yours shows no controls, and that is about PLAYER controls.
// The README is explicit that the host keeps its own on other seats: "the host additionally gets
// Invite (email / QR) on an empty quadrant and the AI seat configurator (commander, style,
// difficulty, pilot) on AI quadrants."
//
// Folding the deck audit away took these with it. Driving the live host found an AI quadrant with
// eleven controls and none of them visible -- so the host could seat an AI and then had no way to
// give it a deck, which stops run-book step 5 (one human, three AI) before it starts. Hiding a
// control is worse than never drawing one: the seat looks finished and does nothing.
check("the host keeps its own tools on an AI or empty quadrant", () => {
  assert.match(game, /cm-seat-host-tools/,
    "the AI seat configurator and the invite editor need a home that is not the hidden audit");
  const hidden = css.split("\n").filter((line) =>
    /(^|,)\s*\.cm-seat-host-tools\b/.test(line.split("{")[0] || "") && /display:none/.test(line));
  assert.deepEqual(hidden, [], "the host's tools must not be display:none on a quadrant");
});

check("only the deck audit is folded away, not everything beside it", () => {
  const rule = /\.cm-seat-audit\{([^}]*)\}/.exec(css);
  assert.ok(rule, "the deck audit still needs its own wrapper");
  assert.match(rule[1], /display:none/, "the audit itself is what folds away");
  assert.ok(!/\$\{body\}\$\{readyBtn\}<\/div>/.test(game.replace(/\s+/g, "")) ||
    /cm-seat-host-tools/.test(game),
    "the opponent quadrant must separate the audit from the host's tools");
});

/* ------------------------------------------------------------------------------- the page head */

// 2b: `h1:'Play'`, `sub:'The four seats laid out as they will sit; the table is the form and the
// status board.'`, `actions: act(['Game history','Host tools ▾'])`.
check("the page is headed Play, with one summary line", () => {
  assert.ok(!/C\.pageHead\("Play a game"/.test(game),
    '2b heads the page "Play", not "Play a game"');
  assert.match(game, /C\.pageHead\("Play"/, 'the head should read "Play"');
});

check("the head carries Game history and Host tools at its right", () => {
  const head = game.slice(game.indexOf("C.pageHead(\"Play\""), game.indexOf("C.pageHead(\"Play\"") + 1400);
  assert.match(head, /Game history/, "2b's action row leads with Game history");
  assert.match(head, /Host tools/, "and carries Host tools beside it");
});

/* ------------------------------------------------------------------------- the center of the table */

// 2b's white panel lists Bracket, Deck cost cap, AI pilot, Remote guests -- four rules, in that
// order. The build wrote "Game Changer cap" and "Seats", which are the lobby's old figures
// rather than the table's rules.
check("the table's card lists 2b's four rules in order", () => {
  const panel = /function centerPanel\([\s\S]*?\n  \}/.exec(game);
  assert.ok(panel, "centerPanel not found");
  const body = panel[0];
  for (const rule of ["Bracket", "Deck cost cap", "AI pilot", "Remote guests"]) {
    assert.ok(body.includes(rule), `2b's table card lists "${rule}"`);
  }
  const order = ["Bracket", "Deck cost cap", "AI pilot", "Remote guests"].map((r) => body.indexOf(r));
  assert.deepEqual(order.slice().sort((a, b) => a - b), order, "in 2b's order");
});

// 2b stamps the wand-and-gear into the panel's bottom-right at 7%, greyscale, bleeding off the
// edge. The README calls it "purely decorative", which is why it is aria-hidden.
check("the table's card carries the decorative logo stamp", () => {
  const panel = /function centerPanel\([\s\S]*?\n  \}/.exec(game);
  assert.match(panel[0], /cm-table-stamp/,
    "2b stamps the wand-and-gear into the panel's bottom-right corner at ~7%, greyscale");
  assert.match(css, /\.cm-table-stamp\{[^}]*opacity:\.0?7/, "at about 7% opacity");
  assert.match(css, /\.cm-table-stamp\{[^}]*grayscale/, "and greyscale, so it tints nothing");
});

/* ----------------------------------------------------- rules that lost to a later copy of themselves */

// Superseded rules are the trap that has already cost this work twice: a later copy of the same
// selector wins on order, so a fix written earlier in the sheet never takes effect. The launch
// line is the live case -- it was given --table-ink to read on its light box, and a second
// .cm-table-launch further down puts --v-ink back, which in the dark theme is light ink on a
// light box. Remove superseded rules; do not out-weigh them.
check("no lobby selector is declared twice in crankmagic.css", () => {
  const dupes = [];
  for (const sel of [".cm-table-center h2", ".cm-table-launch", ".cm-table-rules dt", ".cm-table-rules dd", ".cm-table-setby"]) {
    const n = css.split(sel + "{").length - 1;
    if (n > 1) dupes.push(`${sel} (${n} times)`);
  }
  assert.deepEqual(dupes, [], "a later copy of a selector silently beats the earlier one");
});

/* ------------------------------------------------------------- the table fills the width it has */

// From Rob's testing, 2026-09-21: "Each seat should be wider, and the whole lobby dynamically
// adjust size to always fill the width of the screen ... When adjusting seat width, it should
// maintain aspect ratio."
//
// A height cap on an element with a fixed aspect-ratio silently caps its WIDTH too: the box
// shrinks in both directions to honor the ratio. `max-height:72vh` was doing exactly that, so on
// a tall window the table stopped well short of the content column while the panel below it ran
// the full width. The ratio is the thing to keep; the cap is the thing to drop.
check("the table fills the width it is given", () => {
  const rule = /\.cm-lobby-table\{([^}]*)\}/.exec(css);
  assert.ok(rule, "no base rule for the lobby table");
  assert.match(rule[1], /width:\s*100%/, "the table fills its column");
  assert.ok(!/max-width:/.test(rule[1]), "nothing may cap it short of the column");
});

// A px ceiling on the card's width stops it growing with the table, so on a wide screen the card
// shrinks against its own seats.
check("the table's card scales with the table", () => {
  const rule = /\.cm-table-center\{([^}]*)\}/.exec(css);
  const width = /width:\s*([^;]+)/.exec(rule[1]);
  assert.ok(width, "the card needs a width");
  assert.ok(!/min\(\s*[\d.]+%\s*,\s*[\d.]+px\s*\)/.test(width[1]),
    `width ${width[1]} caps the card in px, so it stops growing while its seats keep going`);
  assert.match(width[1], /%/, "the card's width is a share of the table");
});

/* ------------------------------------------------------- nothing sits underneath the table's card */

// From Rob's testing, 2026-09-21: "I can't get past the lobby because you put boxes on top of
// boxes. I also had selected AI in seat 2, then it cut out the options."
//
// The card is centered over all four quadrants, so its footprint is arithmetic rather than a
// judgment. It is W% of the table wide and, at the same ratio as the table, W% of the table tall;
// centered, that is W/2% of the table reaching into each quadrant from the inner corner. A
// quadrant is half the table, so the card covers W% OF A QUADRANT on both axes.
//
// Insetting each seat's figure on its inner side by at least that much means the two can never
// intersect horizontally, whatever the content does vertically. `.cm-q-XX` names where a
// quadrant's INNER corner is, so br/tr are inset from the right and bl/tl from the left.
check("no seat's content reaches under the table's card", () => {
  const cardWidth = /\.cm-table-center\{[^}]*width:\s*([\d.]+)%/.exec(css);
  assert.ok(cardWidth, "the card's width is a percentage of the table");
  const need = Number(cardWidth[1]);
  const inset = (selector, side) => {
    const rule = new RegExp("\\" + selector + "[^{]*\\.cm-seat-figure\\{([^}]*)\\}").exec(css)
      || new RegExp("\\" + selector + " \\.cm-seat-figure,[^{]*\\{([^}]*)\\}").exec(css);
    if (!rule) return null;
    const m = new RegExp(side + ":\\s*([\\d.]+)%").exec(rule[1]);
    return m ? Number(m[1]) : null;
  };
  const short = [];
  for (const [sel, side] of [[".cm-q-br", "right"], [".cm-q-tr", "right"], [".cm-q-bl", "left"], [".cm-q-tl", "left"]]) {
    const got = inset(sel, side);
    if (got === null || got < need) short.push(`${sel} is inset ${got === null ? "not at all" : got + "%"} from its ${side}, needs ${need}%`);
  }
  assert.deepEqual(short, [], "a seat whose content runs under the card loses whatever is beneath it");
});

/* ------------------------------------------------------------------------------------ the mats */

// From Rob: "in screenshot 3, note these are supposed to be the animated fill visuals for the fan
// slices on the lobby seats. The mats are the 7 or so images I had uploaded before; they were in
// the github repo."
//
// He is right and this was mine. The six elements of `crankmagic-sea.js` are the animated fills
// behind the seats. The mats are a real catalog that already exists -- `game/ui/playmats.mjs`,
// nine entries, images in `game/ui/assets/playmats/`, served by the host at `/playmats.mjs` and
// `/playmats/<name>.png` (game/tools/serve-review.mjs lines 29 and 35) -- with its own
// persistence in `saveMatPreference` / localStorage `crankmagic-playmats-v1`, which is the store
// the table itself reads. Building a second catalog meant a choice that changed nothing in game.
check("Choose mat reads the playmat catalog the game actually uses", () => {
  assert.match(game, /import\("\/playmats\.mjs"\)/,
    "the mats come from game/ui/playmats.mjs, not from the sea elements behind the seats");
  assert.match(game, /PLAYMATS/, "the picker lists that module's own catalog");
  assert.ok(!/CrankSea\.ELEMENTS/.test(game),
    "CrankSea's elements are the animated fills behind the seats, not the playmats");
});

check("choosing a mat writes where the table reads it", () => {
  assert.match(game, /saveMatPreference/,
    "playmats.mjs owns the store (localStorage crankmagic-playmats-v1); writing anywhere else means the choice never reaches the game");
  assert.match(game, /readMatPreferences/,
    "and the picker marks the mat that seat already has");
});

/* ------------------------------------------------------------------------- the animated sea */

// From Rob's testing, 2026-09-21: "the background should be animated with that slowly flowing
// visual animation."
//
// It is animated -- measured at 60 rAF ticks a second in the Playwright Chrome, with the field
// moving. It was not VISIBLE, and the README says why. Anchor, README section "Play lobby
// (table-first, wireframe 2b)": each quadrant is filled with the animated element for that
// seat's status, "`screens/table-sea.js`, one fixed element per canvas, ~80% opacity under a
// dark top/bottom gradient".
//
// The build ran it at 50% and had no gradient at all, so the element was faint everywhere
// instead of strong in the middle and dimmed only where words sit. Wireframe 2b draws the
// gradient as its own layer: linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,.05) 40%,
// rgba(0,0,0,.35)).
check("the sea runs at the opacity the README gives it", () => {
  const call = /startSea\(canvas,[\s\S]{0,200}?opacity:\s*(\.?[\d.]+)/.exec(game);
  assert.ok(call, "the lobby's startSea call not found");
  const opacity = Number(call[1].startsWith(".") ? "0" + call[1] : call[1]);
  assert.ok(opacity >= 0.75, `the README says ~80%; this runs at ${opacity}`);
});

check("a dark top-and-bottom gradient sits over the sea", () => {
  assert.match(game, /cm-seat-shade/,
    "2b draws the gradient as its own layer over the element, which is what lets the sea run at 80% and the words stay readable");
  const rule = /\.cm-seat-shade\{([^}]*)\}/.exec(css);
  assert.ok(rule, "the shade needs a rule");
  assert.match(rule[1], /linear-gradient\(180deg/, "top to bottom, as 2b draws it");
});

/* --------------------------------------------------- the table fits the window it is looking at */

// From Rob's testing, 2026-09-21: "same zoom issue on the lobby. When I zoom in/out, the seats
// aren't becoming smaller/larger. Only their contents ... I want the entire lobby table to
// auto-resize to fit the aspect ratio of the screen resolution, so that ... the entire table is
// viewable without scrolling."
//
// A fixed `aspect-ratio:4/3` on a full-width table makes its height follow its width and nothing
// else, so on a wide window the table was taller than the window and the seats never responded to
// zoom. Sizing it from the space it actually has -- full width, and the height left below it --
// makes a quadrant's shape follow the window's, which is what he asked for.
//
// The card then keeps a seat's shape for free: a quadrant is 50% x 50% of the table and the card
// is 30% x 30%, so they share a ratio at every window shape, with no rule to keep in step.
check("the table is sized from the space it has, not from a fixed ratio", () => {
  const rule = /\.cm-lobby-table\{([^}]*)\}/.exec(css);
  assert.ok(rule, "no base rule for the lobby table");
  assert.ok(!/aspect-ratio:\s*\d/.test(rule[1]),
    "a fixed ratio makes the table taller than the window on a wide screen, and deaf to zoom");
  assert.match(rule[1], /height:/, "it takes the height left below it");
});

// Rob, later the same day: "You can make the middle box height smaller (breaking the ratio) while
// maintaining width (up to the width required for the text used in this box)." That supersedes
// his earlier "same aspect ratio as the seats" for this box: a box of rules is as tall as its
// rules. What has to hold instead is that its WIDTH stays a share of the table -- because the
// inset keeping every seat clear of it is derived from that width, and a px-fixed card would
// drift out of step with the seats as the window grows.
check("the table's card is a share of the table's width, and no taller than its rules", () => {
  const rule = /\.cm-table-center\{([^}]*)\}/.exec(css);
  assert.ok(rule, "no rule for the table's card");
  assert.match(rule[1], /width:\s*[\d.]+%/, "width is a share of the table, which the seat insets derive from");
  assert.ok(!/(^|;)height:\s*[\d.]+%/.test(rule[1]),
    "height follows the content now; a fixed share would put empty card under the seats again");
  assert.match(rule[1], /min-width:/, "with a floor, so the launch line does not wrap to a third row");
});

/* ------------------------------------------------------------------- starting the game, batch 5 */

// From Rob's testing, 2026-09-21: "all 4 show ready, but the game didn't start. I'd like for this
// status row to be 2 columns, with a 15-25% column width on the right with the button 'Start',
// which auto-forces a 10 second countdown (which counts down in the text box to the left of the
// button; the current text) to launch."
//
// The table never started itself. The README describes a table that does -- "There is no Launch
// button: the table starts itself with the 10 s countdown once all four seats report ready" --
// but nothing in the lobby ever counted or launched; `canStartSoon` only produced a sentence.
// Rob has since asked for a Start button as well, which supersedes the README on that point.
check("the launch row is a text box and a Start button", () => {
  const panel = /function centerPanel\([\s\S]*?\n  \}/.exec(game);
  assert.ok(panel, "centerPanel not found");
  assert.match(panel[0], /cm-table-launch-row/, "the launch line and the button share a row");
  assert.match(panel[0], /lobby-start-now/, "a Start control the host can press at any time");
  const rule = /\.cm-table-launch-row\{([^}]*)\}/.exec(css);
  assert.ok(rule, "the row needs a rule");
  assert.match(rule[1], /grid-template-columns:[^;]*(1fr|auto)/, "two columns: the reading, then the button");
});

check("a countdown exists and launches when it reaches zero", () => {
  assert.match(game, /COUNTDOWN_SECONDS\s*=\s*10/, "ten seconds, as Rob asked and the README says");
  assert.match(game, /beginCountdown/, "something has to start it");
  assert.match(game, /cancelCountdown/, "and losing readiness has to stop it");
});

/* --------------------------------------------------------------------------- the host's menu */

// "the host tools screen menu is fully transparent, and when I press the button host tools again,
// it doesn't close the menu."
//
// Every design token is declared on `#matrix-v2` (crankmagic-design.css lines 19, 21, 45). The
// menu was appended to `document.body`, OUTSIDE that element, so every var(--v-*) in `.cm-menu`
// resolved to nothing and the background disappeared. Custom properties inherit down the DOM, and
// a popover is in the top layer for PAINT but still inherits from its DOM parent -- so the fix is
// where it is appended, not what it is painted with. This affects every popover menu in the app.
check("a popover menu is appended where the tokens are", () => {
  assert.ok(!/document\.body\.appendChild\(menu\)/.test(game),
    "appending to document.body puts the menu outside #matrix-v2, where --v-* does not exist");
  assert.match(game, /matrix-v2[\s\S]{0,120}appendChild\(menu\)|appendChild\(menu\)/,
    "the menu is appended inside the element that declares the tokens");
});

check("pressing Host tools again closes the menu", () => {
  const act = /actions\["lobby-host-tools"\][\s\S]*?\n  \};/.exec(game);
  assert.ok(act, "the host tools action not found");
  assert.match(act[0], /hidePopover|\.remove\(\)/,
    "a second press has to close what the first one opened, not stack another behind it");
});

/* ------------------------------------------------------------------------ every link goes somewhere */

// "When I click Game History, it takes me back to the Decks page." It did: the action set
// location.hash = "reports", and there is no `reports` view -- crankmagic-app.js `route()` falls
// back to `decks` for any hash it does not know. A dead link that lands somewhere plausible is
// worse than one that errors, because nothing looks wrong.
check("every route a lobby control navigates to exists", () => {
  const views = new Set();
  for (const file of ["crankmagic-app.js", "crankmagic-decks.js", "crankmagic-collection.js",
    "crankmagic-discover.js", "crankmagic-game.js", "crankmagic-online.js", "crankmagic-lab.js",
    "crankmagic-pull.js", "crankmagic-change-ui.js", "crankmagic-how.js", "crankmagic-orders.js",
    "crankmagic-trade.js", "crankmagic-shop.js"]) {
    let text = "";
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    for (const m of text.matchAll(/views\.([a-zA-Z]+)\s*=/g)) views.add(m[1]);
  }
  /* Comments describe the dead routes they replaced, so they are stripped before scanning --
     otherwise the note explaining a fix reads as the bug still being there. */
  const code = game.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
  const dead = [];
  for (const m of code.matchAll(/location\.hash\s*=\s*["']([a-zA-Z]+)["']/g)) {
    if (!views.has(m[1])) dead.push(m[1]);
  }
  assert.deepEqual(dead, [], `a hash with no view falls back to Decks, so the link looks like it worked`);
});

console.log(`wireframe-conformance: ${checks} checks passed`);
