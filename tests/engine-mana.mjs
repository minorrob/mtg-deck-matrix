/* MANA: WHAT A COST SAYS, AND WHETHER A POOL CAN PAY IT.
 *
 * `docs/engine/PLAN.md` §3.3 (mana and costs: CR 106, 107, 118, 601.2, 605) and §12.1's
 * `payment.automaticEligible` — the board already distinguishes "the engine can just pay this" from
 * "the player has to choose", and the engine has to answer that question the same way.
 *
 * The symbol grammar is where this gets quietly wrong. {2/W} and {W/P} and {W/U} all look like
 * hybrids and none of them pay alike: {W/U} takes either color, {2/W} takes two generic OR one
 * white, and {W/P} takes white or two life and is not mana at all. A parser that folds them
 * together produces costs that are payable when they should not be, which is unwinnable-game
 * territory and the sort of thing nobody reports because they assume they misread the card.
 *
 * MANA VALUE IS NOT THE SAME QUESTION (CR 202.3). {2/W} counts as 2 whatever it is paid with, and X
 * counts as zero everywhere except on the stack (CR 202.3b). Deck statistics, "mana value 3 or
 * less" selectors and the curve on the deck page all read this, so it is worth its own checks.
 */
import assert from "node:assert/strict";
import {parseManaCost, manaValue, canPay, automaticPayment, spend, addMana, poolSize} from "../game/engine/rules/mana.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const pool = (over = {}) => ({W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...over});

/* ---- parsing ---- */
{
  const cost = parseManaCost("{2}{G}{G}");
  eq(cost.generic, 2, "the generic part");
  eq(cost.colored, {W: 0, U: 0, B: 0, R: 0, G: 2, C: 0}, "and the colored requirements, counted per color");
  eq(cost.variable, 0, "with no X");
  eq(cost.symbols.length, 3, "three symbols, because {2} is one symbol and not two");
  eq(manaValue(cost), 4, "mana value four (CR 202.3)");
}
{
  eq(parseManaCost("").generic, 0, "an empty cost is free, not invalid — a land has one");
  eq(manaValue(parseManaCost("")), 0, "and costs nothing");
  eq(parseManaCost("{0}").generic, 0, "an explicit zero is zero");
  eq(parseManaCost("{C}").colored.C, 1, "{C} is a colorless requirement, and is NOT generic — {1} cannot pay it");
  eq(manaValue(parseManaCost("{10}")), 10, "double-digit generic reads as ten, not as one and zero");
}
{
  const x = parseManaCost("{X}{R}");
  eq(x.variable, 1, "one X");
  eq(manaValue(x), 1, "X counts as zero while not on the stack (CR 202.3b)");
  eq(manaValue(x, {x: 3}), 4, "and as its chosen value when there is one");
}
{
  const hybrid = parseManaCost("{W/U}");
  eq(hybrid.symbols[0].kind, "hybrid", "{W/U} is a hybrid");
  eq(hybrid.symbols[0].either, ["W", "U"], "payable with either color");
  eq(manaValue(hybrid), 1, "and counts as one");

  const mono = parseManaCost("{2/W}");
  eq(mono.symbols[0].kind, "monohybrid", "{2/W} is the other kind of hybrid");
  eq(manaValue(mono), 2, "and counts as TWO however it is paid (CR 202.3f)");

  const phy = parseManaCost("{W/P}");
  eq(phy.symbols[0].kind, "phyrexian", "{W/P} is Phyrexian");
  eq(manaValue(phy), 1, "counts as one");
  eq(parseManaCost("{S}").symbols[0].kind, "snow", "and snow is its own kind");
}
{
  assert.throws(() => parseManaCost("{Q}"), /symbol|understand/i,
    "a symbol the engine does not know is refused rather than skipped — a skipped symbol is a cost that is too cheap"); checks += 1;
  assert.throws(() => parseManaCost("2G"), /symbol|braces|understand/i,
    "and a cost without braces is not a cost"); checks += 1;
}

/* ---- the pool ---- */
{
  const p = pool();
  addMana(p, {G: 2, W: 1});
  eq(p.G, 2, "mana added to a pool is there");
  eq(poolSize(p), 3, "and counted");
  assert.throws(() => addMana(p, {Q: 1}), /color|Q/i, "an unknown color cannot be added"); checks += 1;
  assert.throws(() => addMana(p, {G: -1}), /negative|amount/i, "nor a negative amount"); checks += 1;
}

/* ---- can this pool pay this cost ---- */
{
  const cost = parseManaCost("{2}{G}{G}");
  ok(canPay(pool({G: 2, R: 2}), cost), "two green and two red pays {2}{G}{G}");
  ok(!canPay(pool({G: 1, R: 3}), cost), "one green does not, however much red there is");
  ok(!canPay(pool({G: 4}), cost) === false, "four green does: green pays the generic too");
  ok(!canPay(pool({G: 2, R: 1}), cost), "and three mana never pays a four-mana spell");
}
{
  ok(canPay(pool({C: 1}), parseManaCost("{C}")), "colorless mana pays {C}");
  ok(!canPay(pool({G: 1}), parseManaCost("{C}")),
    "and colored mana does not — {C} is a requirement, not a generic one");
  ok(canPay(pool({C: 1}), parseManaCost("{1}")), "while colorless mana pays a generic cost perfectly well");
}
{
  const hybrid = parseManaCost("{W/U}{W/U}");
  ok(canPay(pool({W: 2}), hybrid), "two white pays two {W/U}");
  ok(canPay(pool({U: 2}), hybrid), "so does two blue");
  ok(canPay(pool({W: 1, U: 1}), hybrid), "and one of each");
  ok(!canPay(pool({G: 2}), hybrid), "green pays neither half");

  const mono = parseManaCost("{2/W}");
  ok(canPay(pool({W: 1}), mono), "{2/W} takes one white");
  ok(canPay(pool({G: 2}), mono), "or two of anything");
  ok(!canPay(pool({G: 1}), mono), "but not one of anything else");
}
{
  const x = parseManaCost("{X}{R}");
  ok(canPay(pool({R: 1}), x, {x: 0}), "X of zero asks for one red");
  ok(canPay(pool({R: 3}), x, {x: 2}), "X of two asks for three mana");
  ok(!canPay(pool({R: 2}), x, {x: 2}), "and will not be paid with less");
}
{
  const phy = parseManaCost("{W/P}");
  ok(canPay(pool({W: 1}), phy), "Phyrexian white takes white");
  ok(canPay(pool(), phy, {life: 2}), "or two life, which is not mana at all");
  ok(!canPay(pool(), phy, {life: 1}), "and one life is not enough");
}

/* ---- what the engine pays without asking ---- */
{
  const plan = automaticPayment(pool({G: 2, R: 2}), parseManaCost("{2}{G}{G}"));
  ok(plan, "a pool with exactly one sensible payment produces a plan");
  eq(plan.mana, {W: 0, U: 0, B: 0, R: 2, G: 2, C: 0},
    "which spends the green on the green and the red on the generic — the only thing it could do");
  eq(plan.life, 0, "and no life");
}
{
  const plan = automaticPayment(pool({G: 3}), parseManaCost("{2}{G}"));
  eq(plan.mana.G, 3, "with one color in the pool there is nothing to decide");
}
{
  eq(automaticPayment(pool({G: 1}), parseManaCost("{2}{G}{G}")), null,
    "a pool that cannot pay produces no plan, rather than a plan that overdraws");
}
{
  /* WHEN THE CHOICE MATTERS, THE ENGINE MUST NOT MAKE IT. Two colors and a generic cost: which
     color goes on the generic is the player's business, because the other may be wanted later. */
  const ambiguous = automaticPayment(pool({G: 2, R: 2}), parseManaCost("{1}{G}"));
  eq(ambiguous, null,
    "when more than one legal payment exists, there is no automatic one — §12.1's automaticEligible is false and the player is asked");
}

/* ---- spending ---- */
{
  const p = pool({G: 2, R: 2});
  spend(p, {G: 2, R: 2});
  eq(p, pool(), "a paid cost leaves the pool empty");
  assert.throws(() => spend(pool({G: 1}), {G: 2}), /enough|pool/i,
    "and a pool cannot be spent below zero — a negative pool is how a player casts what they cannot afford"); checks += 1;
}
{
  const p = pool({G: 5});
  const plan = automaticPayment(p, parseManaCost("{1}{G}"));
  spend(p, plan.mana);
  eq(poolSize(p), 3, "spending a plan takes exactly what the plan said");
}

console.log(`engine-mana: ${checks} checks passed — the three hybrids do not pay alike, {C} is not generic, X is zero off the stack, and an ambiguous payment is the player's to make.`);
