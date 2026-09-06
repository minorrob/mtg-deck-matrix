// Brings Compare's published per-stage figures back in line with the hundreds
// the site actually composes.
//
//   node tools/sim/resync-compare.mjs           # report what would change
//   node tools/sim/resync-compare.mjs --write   # write data/variants.json
//
// Compare reads almost everything off variants.json by stage index, and those
// arrays were written when Maxed WAS the Tuned hundred. Promoting Game Changers
// into the Max rung moved the deck underneath them, so the page went on
// advertising Tuned's cost, Tuned's card count and zero Game Changers over a
// build that now carries up to three. reprice.mjs already owns the money; this
// owns the rest of what is derived rather than judged:
//
//   - stageNotes card counts, which are "cards beyond Base" and had drifted at
//     the Tuned rung too, since Base was rebuilt after they were written
//   - the "N GC" chip and the Game Changer clause inside each bracket note
//   - the bracket a Maxed rung sits in. This is a rules question, not an
//     estimate: compliance-model refuses a Game Changer at Tier 2, so a rung
//     carrying one is Bracket 3 whatever a density heuristic guessed
//   - the detail sheet's Game Changer section, in both layouts -- the curated
//     decks named three cards as a hypothetical "route to the top of Bracket 3"
//     that the build does not run, and the generated decks reported per-stage
//     composition counted before the promotion
//
// Editorial fields are left alone on purpose. ranks is Rob's recommendation
// order, not the measured one (it correlates at 0.25 with the sweep's scores,
// so it never was a score ordering); scores and rarity come from the workbook's
// own rubric, which is not reproducible from here. Both are flagged in the
// report rather than guessed at.

import path from "node:path";
import {parseArgs, writeJson, loadCatalog, baseCards, tunedCards, maxedCards, Engine, Lineup, ROOT} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const {variants, buyPlans, audited} = await loadCatalog();

const norm = (name) => Lineup.normalizeName(name);
const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
// The stage notes are prose, so a count reads as a word there, not a numeral.
const WORDS = ["no", "one", "two", "three"];
const spelled = (n, word) => `${WORDS[n] ?? n} ${word}${n === 1 ? "" : "s"}`;
const money = (value) => `$${Math.round(value)}`;
const priceOf = (card) => Number(card?.price ?? 0);

const changes = [];
const note = (id, field, before, after) => { if (before !== after) changes.push({id, field, before, after}); };

for (const variant of variants.variants) {
  const plan = buyPlans.plans[variant.id];
  if (!plan) continue;
  const lists = [baseCards(plan, audited), tunedCards(plan, audited), maxedCards(plan, audited)];
  const base = lists[0];
  const commanderIsGameChanger = base.some((card) => card.isCommander && card.gameChanger);
  const beyondBase = (cards) => cards.filter((card) => !base.some((b) => norm(b.name) === norm(card.name))).length;
  const gcIn = (cards) => cards.filter((card) => card.gameChanger);

  /* ---- stageNotes: the count is "cards beyond Base", for Tuned and Maxed ---- */
  if (Array.isArray(variant.stageNotes)) {
    [1, 2].forEach((index) => {
      const before = variant.stageNotes[index];
      if (typeof before !== "string") return;
      let after = before.replace(/·\s*(\d+)\s*(upgrade cards|spells)/, (whole, _n, unit) => `· ${beyondBase(lists[index])} ${unit}`);
      if (index === 2) {
        const held = gcIn(lists[2]).length;
        after = after.replace(/plus (three|two|one|no) Game Changers?/, `plus ${spelled(held, "Game Changer")}`);
      }
      note(variant.id, `stageNotes[${index}]`, before, after);
      variant.stageNotes[index] = after;
    });
  }

  /* ---- brackets: the chip, the clause, and which bracket a rung is in ---- */
  if (Array.isArray(variant.brackets)) {
    variant.brackets.forEach((bracket, index) => {
      const held = gcIn(lists[index]).length;
      note(variant.id, `brackets[${index}].gameChangers`, bracket.gameChangers, `${held} GC`);
      bracket.gameChangers = `${held} GC`;

      let description = String(bracket.description || "")
        .replace(/\b\d+ Game Changers?\b(?= \(Bracket 2 allows none)/, plural(held, "Game Changer"));

      /* A hundred with a Game Changer in it fails Tier 2 outright, so no density
         estimate can leave it in Bracket 2. This is not only a Maxed question:
         10a and 10d lead with a commander that is itself a Game Changer, so
         every one of their rungs is Bracket 3 and all three were labeled B2.
         Where the published number already sits in Bracket 3 it is kept as the
         within-bracket read. */
      if (held > 0) {
        const current = Number(/(\d+\.\d+)/.exec(description)?.[1] ?? 0);
        if (current < 3) {
          description = description
            .replace(/(\d+\.\d+)/, "3.00")
            .replace(/generated bracket estimate 3\.00/, "bracket 3.00")
            .replace(/Estimated from role density, tutor count and Game Changer count rather than play testing\./,
              `${commanderIsGameChanger ? "The commander is itself a Game Changer, so every rung of this deck is Bracket 3." : "That is what puts it in Bracket 3 by rule."} Where it sits inside the bracket is estimated from role density rather than play testing.`)
            .replace(/Scored from effect-per-mana/,
              `${commanderIsGameChanger ? "The commander is itself a Game Changer, so every rung of this deck is Bracket 3. " : ""}Scored from effect-per-mana`);
          note(variant.id, `brackets[${index}].label`, bracket.label, "B3.0");
          bracket.label = "B3.0";
        }
      }
      note(variant.id, `brackets[${index}].description`, bracket.description, description);
      bracket.description = description;
    });
  }

  /* ---- the detail sheet ---- */
  const html = variant.detailHtml;
  if (typeof html !== "string" || !html) continue;
  const maxGc = gcIn(lists[2]);
  const gcTotal = maxGc.reduce((sum, card) => sum + priceOf(card), 0);
  const itemFor = (name) => (plan.max || []).find((item) => norm(item.name) === norm(name));

  if (html.includes('class="gcnow"')) {
    /* Curated layout. The route table was a suggestion written before the rung
       existed -- 1a advertised Necropotence, Seedborn Muse and The One Ring for a
       build that runs Crop Rotation, Demonic Tutor and Orcish Bowmasters. */
    /* What goes in the third column. The promotion tool's own rationale is the
       same sentence for every card ("Tier 3 capability: a Game Changer…"), which
       says nothing a reader could not read off the chip, so the useful half is
       the slot it took plus what the card itself does. The card's rules text is
       a fact; an evaluative one-liner for a card nobody has written copy for
       would not be. */
    const firstLine = (text) => {
      const line = String(text || "").split("\n").map((part) => part.trim()).filter(Boolean)
        .find((part) => !/^(Flash|Flying|Trample|Haste|Vigilance|Lifelink|Deathtouch|Reach|Menace|Hexproof|Ward\b.*)$/i.test(part)
                     && !/^As an additional cost/i.test(part)) || "";
      const sentence = /^[^.]*\.(?:\s|$)/.exec(line);
      return (sentence ? sentence[0] : line).replace(/\s*\(.*$/, "").trim();
    };
    const rows = maxGc.map((card) => {
      const item = itemFor(card.name);
      const role = /takes the ([a-z]+) slot/.exec(item?.purpose || "")?.[1];
      const took = item?.replaces ? `Takes the ${role ? `${role} ` : ""}slot held by ${item.replaces}.` : "";
      const does = firstLine(card.oracleText);
      return `<tr><td class="nm">${esc(card.name)}</td><td class="pr">${money(priceOf(card))}</td><td>${
        esc([took, does].filter(Boolean).join(" ") || "A Game Changer, which a Bracket 2 build may not run at all.")}</td></tr>`;
    }).join("");

    const tunedLine = gcIn(lists[1]).length
      ? `${gcIn(lists[1]).map((c) => esc(c.name)).join(", ")} — ${commanderIsGameChanger ? "the commander is itself a Game Changer, so this deck is Bracket 3 from the first game." : "already Bracket 3 before the Maxed rung."}`
      : "None — this build is Game-Changer-free, which is what keeps it inside Bracket 2.";

    const block = `<div class="gcnow"><div class="nblbl">Game Changers in this build</div><ul class="next"><li class="none">${tunedLine}</li></ul></div>` +
      (maxGc.length
        ? `<div class="nblbl">The Maxed rung — ${plural(maxGc.length, "color-legal Game Changer")}, about ${money(gcTotal)}</div>` +
          `<table class="route"><tr><th>Game Changer</th><th class="pr">$</th><th>What it replaces, and what it buys you</th></tr>${rows}</table>` +
          `<p class="method">Three is the ceiling: a fourth would put the deck in Bracket 4. These are not a shortlist — they are the cards the Maxed hundred runs. Each was tried in several slots in the list it would join, kept only where the deck did not measurably get worse over 3,000 simulated games, and confirmed afterwards on a seed the selection never saw. Prices are Scryfall market values.</p>`
        : `<p class="method">No in-color Game Changer survived measurement for this commander, so the Maxed rung is this deck at its ceiling without one.</p>`);

    const start = html.indexOf('<div class="gcnow">');
    const table = start >= 0 ? html.indexOf('<table class="route"', start) : -1;
    const method = table >= 0 ? html.indexOf('<p class="method">', table) : -1;
    const end = method >= 0 ? html.indexOf("</p>", method) + "</p>".length : -1;
    if (start >= 0 && end > start) {
      const after = html.slice(0, start) + block + html.slice(end);
      note(variant.id, "detailHtml.gcnow", "«route table»", "«Maxed rung»");
      variant.detailHtml = after;
    }
    // "…plus the three Game Changers below (~$167)" is the same three cards.
    const before = variant.detailHtml;
    variant.detailHtml = before.replace(/plus the three Game Changers below \(~\$\d+\)/,
      `plus the ${plural(maxGc.length, "Game Changer")} below (~${money(gcTotal)})`);
    if (before !== variant.detailHtml) note(variant.id, "detailHtml.roomToGrow", "«GC subtotal»", "«recomputed»");
  } else if (html.includes("How the stages differ")) {
    /* Generated layout. Both blocks counted the composition before promotion. */
    const roleCount = (cards, key) => cards.filter((card) => Engine.classifyCard(card || {})[key]).length;
    const line = (label, cards) => `<li><b>${label}</b> — ${cards.length} distinct cards, ${
      roleCount(cards, "isRamp")} ramp, ${roleCount(cards, "isDraw")} draw, ${roleCount(cards, "isRemoval")} removal, ${
      plural(gcIn(cards).length, "Game Changer")}</li>`;
    const list = `<ul>${["Base", "Tuned", "Maxed"].map((label, index) => line(label, lists[index])).join("")}</ul>`;
    const start = html.indexOf("<ul>", html.indexOf("How the stages differ"));
    const end = html.indexOf("</ul>", start) + "</ul>".length;
    if (start > 0 && end > start) {
      variant.detailHtml = html.slice(0, start) + list + html.slice(end);
      note(variant.id, "detailHtml.stages", "«pre-promotion counts»", "«recomputed»");
    }
    const before = variant.detailHtml;
    const held = maxGc.length;
    variant.detailHtml = before.replace(/<h3>Bracket placement<\/h3><p>[^<]*<\/p>/, () => {
      const estimate = held > 0 ? "3.00" : (/estimate (\d+\.\d+)/.exec(before)?.[1] || "2.60");
      const tail = held > 0
        ? `That is what puts it in Bracket 3 by rule; where it sits inside the bracket is estimated from role density rather than play testing.`
        : "Estimated from role density, tutor count and Game Changer count rather than play testing.";
      return `<h3>Bracket placement</h3><p>Maxed: bracket ${estimate}. ${plural(held, "Game Changer")} (Bracket 2 allows none, Bracket 3 allows up to three). ${tail}</p>`;
    });
    if (before !== variant.detailHtml) note(variant.id, "detailHtml.bracketPlacement", "«pre-promotion»", "«recomputed»");
  }
}

const byField = changes.reduce((acc, change) => ((acc[change.field.replace(/\[\d+\]/, "[]")] = (acc[change.field.replace(/\[\d+\]/, "[]")] || 0) + 1), acc), {});
console.log("fields corrected:");
Object.entries(byField).sort((a, b) => b[1] - a[1]).forEach(([field, count]) => console.log(`  ${String(count).padStart(3)}  ${field}`));
console.log("\nsamples:");
changes.filter((c) => /stageNotes|gameChangers|label/.test(c.field)).slice(0, 8).forEach((c) =>
  console.log(`  ${c.id.padEnd(4)} ${c.field}\n        was: ${String(c.before).slice(0, 110)}\n        now: ${String(c.after).slice(0, 110)}`));
console.log(`\n${changes.length} corrections across ${new Set(changes.map((c) => c.id)).size} variants`);
console.log("left alone (editorial, not derived): ranks, scores, rarity, summaries");

if (args.write) {
  await writeJson(path.join(ROOT, "data/variants.json"), variants);
  console.log("written to data/variants.json");
} else {
  console.log("(dry run — pass --write to save)");
}
