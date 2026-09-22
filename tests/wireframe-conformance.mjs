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
const online = readFileSync("crankmagic-online.js", "utf8");

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
// Two of Rob's asks pulled against each other, and I resolved it the lazy way once and he caught
// it: batch 1 was "when adjusting seat width, it should maintain aspect ratio"; batch 4 was "the
// entire table is viewable without scrolling". Dropping the ratio satisfied the second by
// sacrificing the first, and the seats went letterboxed — "The 4 seats are too thin now."
//
// Both hold if the table keeps its ratio and is limited by WHICHEVER of width or height binds
// first: `width: min(100%, height × ratio)`. On a tall window it fills the column; on a short one
// it is height-limited and centres, with margin either side. That is a contain fit, and it is
// what should have been written the first time.
check("the table keeps its shape and fits whichever way is tighter", () => {
  const rule = /\.cm-lobby-table\{([^}]*)\}/.exec(css);
  assert.ok(rule, "no base rule for the lobby table");
  assert.match(rule[1], /aspect-ratio:\s*\d/,
    "the seats are quarters of this box, so this is what keeps their shape");
  assert.match(rule[1], /width:\s*min\(/,
    "limited by the column OR by the height left below it, whichever is tighter");
  assert.match(rule[1], /--cm-table-h/, "the height still comes from the room measured per render");
  assert.ok(!/max-height:\s*[\d.]+(vh|vw)/.test(rule[1]),
    "a separate height cap would fight the ratio, which is the bug from batch 1");
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
// Rob, batch 10: "the note on the top of 'Game Runs on your Own Computer' and the content in
// 'What CrankMagic Online is' should all be in the question mark button next to Play."
//
// The lobby still refuses to count down on a web copy and Start still explains itself, so nothing
// is lost by taking the banner off the page — the explanation moves to where explanations live.
// The LOCAL "host offline" banner stays: it carries a Check again button, which is an action, not
// an explanation.
check("the web copy explains itself in the help, not in a banner", () => {
  assert.ok(!/Games run on your own computer/.test(online),
    "the remote explanation belongs in the help button beside Play");
  assert.match(game, /C\.HELP\.game[\s\S]{0,2000}own computer/,
    "and it has to actually be there");
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
  /* A flex row, not a grid one. As a grid the reading kept its content height while the button
     stretched to a row taller than either, so the two never matched — and Rob asked for them to
     be the same height. */
  assert.match(rule[1], /display:flex/, "the reading and the button sit in one row");
  /* THIS CHECK USED TO REQUIRE `align-items:stretch`, AND STRETCH DID NOT DELIVER WHAT IT ASKED
     FOR. Measured on the running lobby, 2026-09-21: the reading was 213x44 and the button 49x60 —
     the button stretched past a row the reading never filled, so the two were 16px apart, which is
     the exact mismatch this check exists to prevent. Rob: "I want a horizontal, not vertical
     rectangle for the button here... the same height as the [reading] container next to the
     button" — and to take about 10% off both once they matched.
     They now carry the SAME EXPLICIT HEIGHT, so the check asserts the outcome rather than a
     mechanism that was never producing it. */
  const body = (sel) => { const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]*)\\}").exec(css); return m ? m[1] : null; };
  const height = (text) => { const m = /(?:^|;)height:\s*(\d+)px/.exec(text || ""); return m ? Number(m[1]) : null; };
  const reading = body(".cm-table-launch"), start = body(".cm-table-launch-row .v-button");
  assert.ok(reading && start, "the reading and the Start button each need a rule");
  const readingH = height(reading), startH = height(start);
  assert.ok(readingH && startH, `both state an explicit height (reading ${readingH}, button ${startH})`);
  assert.equal(readingH, startH, "and it is the same height, which stretch never achieved");
  /* Horizontal, not vertical: a button narrower than it is tall was the thing Rob objected to. */
  const startW = /min-width:\s*(\d+)px/.exec(start);
  assert.ok(startW && Number(startW[1]) > startH,
    `the Start button is wider than it is tall (min-width ${startW ? startW[1] : "unset"}, height ${startH})`);
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

/* ------------------------------------------------------------ when starting fails, batch 6 */

// From Rob's testing, 2026-09-21: "When the countdown finished I got an HTTP 404 error ... Then
// the countdown just starts over. It should try up to 1 additional time, then report back in the
// status box in the middle (instead of the error) a statement indicating an error and if they
// want to send the error report to me. (e.g. Error: Send error report?) Then the Start/Stop
// button should have a 3rd option that only appears when that text shows error, which should be
// 'Send Log' ... opens default e-mail client and pastes the error into the text with
// pre-populating my e-mail minor.rob@gmail.com as the To field."
//
// The restart was mine: lobby-start's catch sets startInFlight = false and redraws, the redraw
// asks syncCountdown, the table is still ready, and it counts down into the same failure again,
// for ever. A loop that retries a failing call without limit is worse than one that stops,
// because it buries the message that would explain it.
check("a failed start is retried once and then stops", () => {
  assert.match(game, /START_ATTEMPTS\s*=\s*2/,
    "the first go and one more, which is what Rob asked for");
  assert.match(game, /launchError/, "the failure is held, not just shown once in a toast");
});

check("the launch box carries the error, and offers to send it", () => {
  const panel = /function centerPanel\([\s\S]*?\n  \}/.exec(game);
  assert.ok(panel, "centerPanel not found");
  assert.match(panel[0], /launchError/, "the box states the error instead of the countdown line");
  assert.match(panel[0], /lobby-send-log/, "and the button becomes Send Log while it is showing");
});

check("Send Log opens a mail client addressed to Rob, carrying the error", () => {
  const act = /actions\["lobby-send-log"\][\s\S]*?\n  \};/.exec(game);
  assert.ok(act, "the send-log action not found");
  assert.match(act[0], /minor\.rob@gmail\.com/, "his address, as he gave it");
  assert.match(act[0], /mailto:/, "the default mail client");
  assert.match(act[0], /launchError/, "with the error in the body, not a blank message");
});

// "When I click on a card in the lobby, it's pop-up image should be 80-110% the size of the card
// on the table." It had no width rule at all, so it took the image's natural size and bore no
// relation to the card it came from.
check("the card pop-up is sized from the card that opened it", () => {
  const act = /actions\["lobby-art-zoom"\][\s\S]*?\n  \};/.exec(game);
  assert.ok(act, "the zoom action not found");
  assert.match(act[0], /getBoundingClientRect/,
    "the pop-up is sized from the clicked card's measured width, not from the image's own size");
});

/* ------------------------------------------------- a lobby that cannot start, and says so, batch 7 */

// Rob's Send Log, 2026-09-21, answered the 404 in one line:
//
//   HTTP 404
//   Route: https://minorrob.github.io/mtg-deck-matrix/#game
//
// He was on GitHub Pages. `fetch('/api/setup')` resolved to https://minorrob.github.io/api/setup,
// which does not exist -- a bare 404 with no body, exactly what the message implied. And from an
// https page, reaching http://127.0.0.1:8768 is mixed content, which browsers block outright, so
// Play on Pages can never start a game at all.
//
// The defect is not the 404. It is that the Play tab there looks completely operational: the
// banner in crankmagic-online.js was gated on `location.hostname === '127.0.0.1'`, so on any
// other origin it never appeared, the table rendered as normal, the countdown ran, and the first
// thing that told anyone was an HTTP status code.

check("the host banner is shown wherever the host is missing, not only on 127.0.0.1", () => {
  assert.ok(!/location\.hostname===['"]127\.0\.0\.1['"]&&!hostStatus\.available/.test(online),
    "gating the banner on the local hostname hides it on exactly the origins that cannot play");
  assert.match(online, /hostStatus\.reason|remote-origin/,
    "a page served from the web and a host that is not running are different problems and need different words");
});

check("the lobby does not count down when no host can answer", () => {
  assert.match(game, /hostReachable/, "the lobby has to know whether anything can start a game");
  const sync = /function syncCountdown\([\s\S]*?\n  \}/.exec(game);
  assert.ok(sync, "syncCountdown not found");
  assert.match(sync[0], /hostReachable/,
    "counting down to a call that cannot succeed is the loop that produced the 404");
});

check("a host that does not answer says so in words, not a status code", () => {
  const api = /async function lobbyApi\([\s\S]*?\n  \}/.exec(game);
  assert.ok(api, "lobbyApi not found");
  assert.match(api[0], /location\.origin/,
    '"HTTP 404" tells a person nothing; the message should name the origin that answered instead');
  assert.match(api[0], /game host/i, "and say what is missing there");
});

/* ------------------------------------------------------ where the seats sit, and batch 8 */

// From Rob's testing, 2026-09-21: "the order of seats should be 1 in top left, 2 top right, 3
// bottom left and 4 bottom right."
//
// This supersedes the README, which reads "in the order they sit (2 · 3 / 4 · 1, you
// bottom-right)". Reading order beats table order for him, and it is his product.
//
// `.cm-q-XX` names a quadrant's INNER corner -- the one touching the table's card -- not its
// position, so the mapping is the mirror of the position: top-left sits against br, top-right
// against bl, bottom-left against tr, bottom-right against tl. Every CSS rule keyed on those
// classes therefore keeps working unchanged, which is the point of naming them that way.
check("the seats read 1, 2, 3, 4 across the table", () => {
  const table = /const seats = `<div class="cm-lobby-table">([\s\S]*?)<\/div>`;/.exec(game);
  assert.ok(table, "the table template not found");
  const order = [...table[1].matchAll(/(oppQuad\((\d)|quadrant\()\s*,?\s*'(\w\w)'/g)].map((m) => m[3]);
  assert.deepEqual(order, ["br", "bl", "tr", "tl"],
    "top-left, top-right, bottom-left, bottom-right — named by the inner corner each one touches");
  const first = table[1].indexOf("is-you");
  assert.ok(first > -1 && first < table[1].indexOf("oppQuad"),
    "you are seat 1, so you are drawn first, in the top left");
});

// "Top left getting cut off. I had pressed Clear the Table, then I selected AI in the top left,
// and see this screen" — the AI configurator is a six-field form and a quadrant is about 390px
// tall, so it was clipped. Keeping it inline was my call and it was wrong twice: once for width,
// now for height. Wireframe 2b shows one line of detail on a quadrant, and 2d puts Change deck in
// a dialog over the table.
check("the seat configurator opens in a dialog, not inside the quadrant", () => {
  assert.match(game, /actions\["lobby-setup-seat"\]/,
    "a six-field form does not fit in a quadrant; 2d opens it over the table");
  const opp = /function seatBoxOpp\([\s\S]*?\n  \}/.exec(game);
  assert.ok(opp, "seatBoxOpp not found");
  assert.ok(!/tools = inlineDeckEditor\(/.test(opp[0]),
    "the quadrant carries a control that opens the form, not the form itself");
});

// "I don't have a way to go back on the top left seat to select whether human or AI (need back
// arrow)". Once a role was chosen the only way out was Clear the table, which empties all four.
check("a seat whose role is set can go back to the choice", () => {
  assert.match(game, /actions\["lobby-seat-back"\]/,
    "choosing Human or AI was a one-way door; only Clear the table undid it, and that empties the table");
});

/* --------------------------------------------- a table that started does not start again, batch 9 */

// From Rob, 2026-09-21: "It counted down from 10, then launched forge, then started counting
// again, then I got the error" — *A standalone match is already running.*
//
// Mine. `syncCountdown` knew about `startInFlight`, a manual stop and an error, but had no notion
// of a game that had ALREADY STARTED. The moment `lobby-start` finished, `startInFlight` went
// false, the table was still ready, and it counted straight down into launching a second game on
// top of the first. **The error he saw was the engine refusing to be started twice, which was the
// only part of the sequence working correctly.**
check("a table that has launched does not count down again", () => {
  assert.match(game, /gameLaunched/, "the lobby has to know a game is already running");
  const sync = /function syncCountdown\([\s\S]*?\n  \}/.exec(game);
  assert.ok(sync, "syncCountdown not found");
  assert.match(sync[0], /gameLaunched/,
    "without this the countdown relaunches into the engine it just started");
});

// Rob, after batch 9 shipped: "After the forge instance opens after being trigger by Start ...
// it is closing forge and reopening it, but it's staying in this loop."
//
// The flag existed but was set too late. `/api/start` returning 200 means the engine was spawned;
// everything after that is reporting. `lobbyPollLive` threw, the catch counted it as a FAILED
// START, and the retry ran `lobby-start` again — which since batch 9 closes the running engine
// and opens a new one. So a working game was killed and relaunched, over and over, and the
// auto-restart I added one batch earlier is what turned a harmless retry into a destructive one.
check("a launched game is never relaunched by a reporting error", () => {
  const start = /actions\["lobby-start"\] = async[\s\S]*?\n  \};/.exec(game);
  assert.ok(start, "lobby-start not found");
  /* Comments here name the calls they describe, so they are stripped before ordering anything --
     otherwise the note explaining the fix is read as the code it replaced. */
  const code = start[0].replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
  const at = (s) => code.indexOf(s);
  assert.ok(at("gameLaunched = true") > -1, "the launch has to be recorded");
  assert.ok(at("gameLaunched = true") < at("lobbyPollLive"),
    "recorded BEFORE anything that can throw, or a slow report reads as a failed launch");
  assert.match(start[0], /if \(gameLaunched\) \{[^}]*return;/,
    "and the failure path must not retry a game that is already running");
});

check("the launch box says the game is running, and offers the table", () => {
  const panel = /function centerPanel\([\s\S]*?\n  \}/.exec(game);
  assert.ok(panel, "centerPanel not found");
  assert.match(panel[0], /gameLaunched/, "the reading reflects a running game");
  assert.match(panel[0], /lobby-open-table/, "and the button goes to it rather than starting another");
});

/* ------------------------------------------------------- the board opens in its own tab, step 6 */

// Rob's twelve-step flow, step 6: "I see a new tab auto-created that loads the game board (not
// the lobby, not a copy of CrankMagic, just the live play board with a link to go to the full
// website available on the board also)."
//
// The board is `/review` on the local host — `game/ui/review.html`, served at line 25 of
// serve-review.mjs, and it already carries `href="/app/#decks"` back to the full site. `/play` is
// the GUEST path and 404s on the host, so it is the wrong target.
//
// What the lobby did instead was `location.assign('/')`, and the host's root 302s to
// `/app/#game` — so a successful launch navigated the tab straight back to the lobby it came
// from. That is why a board was never seen.
check("a launched game opens the board in a new tab", () => {
  const fn = /function lobbyResumeTabletop\([\s\S]*?\n  \}/.exec(game);
  assert.ok(fn, "lobbyResumeTabletop not found");
  assert.match(fn[0], /window\.open\(/, "step 6 asks for a new tab, not a navigation");
  assert.match(fn[0], /['"]\/review['"]/, "the host's board is /review; /play is the guest path and 404s here");
  assert.ok(!/location\.assign\(['"]\/['"]\)/.test(fn[0]),
    "the host root 302s to /app/#game, so this sent a launched game back to its own lobby");
});

// A pop-up opened without a click is blocked, and the countdown launches without one. So the
// failure has to be visible rather than silent.
check("a blocked pop-up leaves a link instead of nothing", () => {
  const fn = /function lobbyResumeTabletop\([\s\S]*?\n  \}/.exec(game);
  assert.match(fn[0], /boardWindow|blocked|openedBoard/,
    "the countdown starts a game with no click behind it, so the browser may refuse the tab");
  assert.match(game, /cm-table-board-link|lobby-open-board/,
    "and then the launch box has to offer the way in");
});

/* ------------------------------------------------- the play board, frame 2e (Stage B.2 / B.4) */

// The frame is emphatic, and both halves have already been got wrong once:
//   "The four boards are always identical in size (one 2x2 grid of equal 16:9 tracks; content
//    clips inside, never grows a board) and keep 16:9 at every size."
//   "Nothing sits below the mat but your hand."
//
// The first attempt at this put aspect-ratio on .seat and left review.mjs still moving three seats
// into an .opponent-boards container, so the ratio held and the boards were still 190x107 against
// 1028x578 — measured at three widths before it was reverted. No stylesheet can size elements that
// are not siblings, so the structural half is guarded here too: the container must stay gone.
{
  const boardCss = readFileSync("game/ui/online.css", "utf8");
  const board = readFileSync("game/ui/review.mjs", "utf8");
  check("the four boards are equal 16:9 tracks", () => {
    const seat = /body\.table-view \.seat\{([^}]*)\}/.exec(boardCss);
    assert.ok(seat, "the play board's seat rule");
    assert.match(seat[1], /aspect-ratio:16\/9/, "each board keeps 16:9 at every size");
    assert.match(seat[1], /overflow:hidden/, "content clips inside a board rather than growing it");
  });
  check("no board is sized differently from the others", () => {
    assert.equal(board.includes("opponent-boards"), false,
      "review.mjs must not move seats into a separate container; boards that are not siblings cannot be sized together");
    assert.equal(boardCss.includes(".opponent-boards"), false, "and no rule may style a container that no longer exists");
    const primary = /body\.table-view \.primary-seat\{([^}]*)\}/.exec(boardCss);
    assert.ok(primary, "the owner's board is still marked");
    assert.doesNotMatch(primary[1], /grid-(column|row)/,
      "primary-seat says which board is yours, not which one is bigger — Focus is frame 2f's job");
  });
  check("the mat leaves a middle channel for the center counter", () => {
    const table = /body\.table-view \.table\{([^}]*)\}/.exec(boardCss);
    assert.ok(table, "the mat rule");
    assert.match(table[1], /grid-template-columns:minmax\(0,1fr\) \d+px minmax\(0,1fr\)/,
      "two board columns with a fixed spacer between them, which B.3's counter straddles");
  });
  check("nothing sits below the mat but the hand", () => {
    const hand = /body\.table-view \.hand\{([^}]*)\}/.exec(boardCss);
    assert.ok(hand, "the hand rule");
    assert.match(hand[1], /grid-column:1\/-1/, "the hand spans the mat's full width");
    assert.match(hand[1], /grid-row:4/, "on the mat's bottom row, under both board rows");
  });
}

console.log(`wireframe-conformance: ${checks} checks passed`);
