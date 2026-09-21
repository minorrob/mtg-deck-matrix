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

console.log(`wireframe-conformance: ${checks} checks passed`);
