# The agents

*What Claude is asked to do in this app, how each ask is grounded, and what each one costs.*

Companion to [`claude-api-evaluation.md`](./claude-api-evaluation.md), which covers the
money and the key-holding problem. This one is about the work: the prompts, the schemas,
and — the part that matters — the checks that decide whether an answer is allowed on screen.

**The rule every agent here follows.** The app measures; the model explains. Card counts,
the curve, the mana, the score, the per-card numbers — all computed, all handed to the
model as fact, never asked for. What comes back is prose, and prose is checked against the
data it was given before anybody reads it.

---

## 1 · How to play it — **built**

`guide-agent.js` · `tools/generate-guides.mjs` · `tests/guide-agent.mjs` (16 checks)

**The hole.** Six decks have a written guide. The other forty-four variants have none, and
every imported deck has none, and `guideFor()` returns null so the panel is simply absent.
It is the largest visible gap in the app and the one thing on the deck page a template
genuinely cannot produce — a paragraph about what a hundred specific cards are trying to do
together.

**What is asked.** Eleven prose fields, as a JSON schema through
`output_config.format`: nickname, hook, archetype, difficulty, whatItDoes, howItWins, a
three-to-five step turn plan, mulligan advice, four to six key cards with reasons,
three to five real weaknesses, and an upgrade path. Nothing else — `id`, `label`,
`commander`, `colorIdentity` and the whole `shape` block are computed here and merged in
afterwards.

**What is given.** The commander, the color identity, the hundred by name and quantity, and
the shape as a sentence the model may quote from: *"Counts you may quote: 36 lands, 30
creatures, 6 instants… Average mana value 3.1. Curve: 4 at 1, 12 at 2…"*. The model is never
asked to count, because a model asked for a number is a model that can get a number wrong.

**What is checked**, before a word is written anywhere:

| Check | Severity | Why it exists |
|---|---|---|
| Every `keyCards` name is one of the hundred | error | The strictest gate available: not "a real card", *one of these cards*. A set difference cannot be argued with. |
| No prose names a real card the deck does not hold | error | *"Goblin Bombardment turns each token into damage"* reads exactly like the rest of the guide and describes a deck nobody has. |
| `upgradePath` is exempt from that | — | Naming cards to add is its entire job. |
| A type count must match the shape | error | "Twenty-six creatures carry the plan" against a deck with thirty. |
| A count tied to no type goes to review | review | *"Eleven cards discard on purpose"* is the best sentence in the six hand-written guides and no card list can verify it. Rejecting it would cost the guides their best line; asserting it silently would be worse. |
| Difficulty is one of three tiers, no field missing | error | A blank panel is worse than no panel. |

**Five ways the checker was wrong before it was right**, each fixed and each with a named
test, because every one of them would have rejected a correct guide:

1. *"Thirty-six lands is a lot to draw"* was read as **"six lands"** — a hyphen is a word
   boundary and `six` is in the number table. Compound number words are joined first.
2. *"Keep three or four lands"* is advice about an opening hand. The whole `mulligan` field
   is exempt, and hand-language sentences elsewhere are skipped.
3. *"three creatures fly over a stalled board"* is about a board, not a list. A count under
   half the real figure is not a contradiction of it.
4. *"Wall of Roots, Saruli Caretaker, Portcullis Vine"* — capping how many words a
   capitalised run could hold cut the list mid-name, leaving **"Roots"** as the longest
   thing left at that position. Runs are now unbounded; the *window* is capped at eleven
   words, the longest card name in the registry.
5. *"…and the Elixir untaps him"* — a card called back by one word. There is a real card
   called Elixir. Every collision in the six shipped guides was one word long; every genuine
   reference was two or more, so a registry match now needs two words.

**The test that matters:** the six guides a person wrote by hand are run through the checker
against their real hundreds. They pass. Anything it flags is either a bug in the checker or
something wrong in a shipped guide, and both deserve a failure.

**Cost.** ~700 tokens in, ~1,700 out per deck on `claude-opus-5`. Forty-seven decks with no
guide: **$2.17 at list, $1.08 batched.** `node tools/generate-guides.mjs` prints exactly
that and sends nothing; `--call` needs `ANTHROPIC_API_KEY` in the shell.

**Where it runs.** A tool, not the browser. There is no key in this repository and nowhere
to put one, so a guide is generated on a machine that has a key, checked, read in a diff and
committed as data. `tests/guide-agent.mjs` asserts that `index.html` does not load the agent.

---

## 2 · Deck strategy considerations — **next**

The guide says how to play the deck on its own terms. What it does not say is how to play it
*against a table*, and that is a different question with a different shape: what to do as
the archenemy, what to do against a fast combo seat, which of your cards you are holding for
a board wipe, who to attack first and why.

**What grounds it.** More than the guide has. The simulator now returns, per card, how often
a draw became a cast, on which turn, and the win rate of games it was cast in — plus the
score broken into nine parts with what each one cost. So the ask is not "advise me about this
deck", it is: *here is what actually happened over 120,000 games, and here is where the deck
lost its points; say what a pilot should do differently.* The answer can be checked the same
way the guide is — every card named must be in the hundred — and it can be checked against
the measurement too: advice that contradicts a measured figure is rejected.

**Shape.** One call per deck, on the same schema pattern: four or five considerations, each
naming the cards involved and the situation. ~900 tokens in (the hundred plus the
breakdown), ~600 out. **About 1.9 cents a deck.**

**The grounding this was missing, and now has a shape.** Measure the same hundred under two
pilot policies — friendly casual and highly competitive — and the *difference* is the advice.
A deck that scores 65 casual and 82 competitive does not need new cards; it needs its owner to
attack the leader, and the breakdown says so precisely: if the seventeen points are
concentrated in *Closes the game*, the advice is about the clock; if they are in *Has answers
when it needs them*, it is about holding removal rather than casting it on sight. The app
computes which part moved and by how much; the model writes the sentence.

That is a better prompt than "advise me about this deck" by some distance, because the answer
is checkable against a number rather than against taste. See `docs/prd.md` §11 — the pilot
policy has to exist in `sim-engine.js` first.

**Status.** Not built, and now blocked on something specific rather than on judgement: the
engine has one pilot policy, so there is no second run to difference against.

---

## 3 · Copilot recommendations — **worth doing, smallest change**

The Copilot on the card graph already produces findings from the simulator and the
collection: *"Shadrix is 53 cards short of its own target — 34 are in hand or on order, 19
would need buying, about $42.49."* Each finding carries its own evidence, its own count and
its own filter. What it does not carry is what to **do**.

This is the cheapest useful agent in the app, because the grounding is already built: a lens
is a small structured object, so the prompt is the lens and nothing else. ~200 tokens in,
~120 out — **a twentieth of a cent per finding**, and a whole page of findings for less than
a cent. Twenty findings batched is under half a cent.

**The check** is the same one that makes the lens trustworthy: every card named must be in
the lens's own `filter.ids`. The model may only talk about the cards the finding is already
about.

**A finding worth adding once the pilot policy exists:** *"Krenko scores 17 points higher
played competitively, and all of it is in how fast it closes."* That is a lens like any other
— a number, its evidence, and a filter — and it is advice about the game rather than about the
shopping list, which the Copilot currently has none of.

**The risk to avoid.** The Copilot's value is that it is *measured*. An agent that turns a
count into a recommendation must not add a claim the count does not support — so the schema
asks for one imperative sentence and one reason, both about the cards in the finding, and
nothing about how good the deck is.

---

## 4 · Explaining the score — **cheap, and the readout just made it possible**

The deck page now says *"6.5 of 10 · Closes the game · wins on turn 10.8 on average; turn 8
is full marks, turn 16 is none."* The next question a player asks is *why is it turn 10.8?* —
and the answer is in the data: the finishers cost eight, and the per-card figures say they
land on turn 8.8 in 81% of the games they are drawn in.

One call, given the breakdown and the top and bottom five cards. ~500 tokens in, ~300 out —
**about a cent.** Checked the same way: every card named must be one that was sent.

This is the highest ratio of usefulness to risk of anything on this page, because the model
is not being asked to know anything about Magic. It is being asked to read a table out loud.

---

## 5 · Cards that do a specific thing, and choosing a commander

Both costed in [`claude-api-evaluation.md`](./claude-api-evaluation.md) §4.2 and §4.3 —
1.3 cents and 1 cent a question. Both need live answers, which means they are the features
that pull in a proxy, so they come after everything above. The grounding for both is the
31,830-card registry the app already loads, and
`tools/claude-api-grounding.mjs` demonstrates that nothing invented, nothing banned and
nothing off-color can reach the screen.

---

## 6 · A chat, if there is one

Deliberately last, and deliberately the most constrained thing here.

- **Model: `claude-sonnet-5`** ($2/$10 per MTok), not Haiku. The temptation is Haiku, and it
  is the wrong call for the same reason as everywhere else in this app: these are knowledge
  questions about Magic cards, and Haiku 4.5 answers those at about a tenth of Opus 5's cost
  and 63% accuracy against 92%. Sonnet is the point on that curve where speed and being
  right meet — fast enough to feel like chat, accurate enough that the registry gate is
  catching slips rather than doing the work.
- **Context is capped hard and by construction, not by asking nicely.** The deck in view (a
  hundred names, ~600 tokens), its measured breakdown (~200), and the last four turns of
  conversation. Nothing else. No card corpus, no collection, no history. A cap that lives in
  the code cannot be talked past.
- **Answers are short by schema.** `max_tokens` around 400, and a system prompt that says
  three sentences, not an essay. The failure mode of a chat box is a paragraph nobody reads.
- **The same gate.** Every card name in every answer goes through the registry and the
  deck's own list before rendering, exactly as the import resolver does. An answer naming a
  card that does not exist does not get shown; it gets asked again.
- **Cost.** ~900 tokens in, ~300 out per turn: **0.48 cents a message**, about half a cent.
  A hundred messages is under fifty cents. Prompt caching does not help at this size — the
  minimum cacheable prefix on Sonnet 5 is 1,024 tokens and the whole context is smaller than
  that.
- **What it must refuse.** Rules adjudication ("does this combo work") is a judge question
  and a wrong answer loses a game. Prices change daily and Scryfall has them. And it never
  scores a deck — the simulator does that, and a chatted number would look identical to a
  measured one on the same screen.

---

## 7 · Where the API does not belong

- **Scoring a deck.** 120,000 games per measurement. A model would guess, and the guess
  would sit in the same box as a measurement.
- **The slot suggester.** `Slot.slotFit` is pinned against the simulator across the whole
  catalog. A model would be less accurate, less explicable and more expensive.
- **Card prices.** Scryfall and TCGplayer have them.
- **The critical path.** Every feature above degrades to exactly what the app does today
  when the call fails, is slow, or was never made. A page that needs an API to render is a
  page that breaks when somebody else's service does.

---

## The order to build them

| # | Agent | Live call needed | Cost | Why this position |
|---|---|---|---|---|
| 1 | **How to play it** | no | $1.08 for 47 decks | Built. Fills a panel that is missing on forty-four decks, offline, with no key in the browser. |
| 2 | **Explaining the score** | no for shipped decks | ~1¢ each | The data exists as of the readout; the model only reads a table out loud. |
| 3 | **Copilot recommendations** | no | <½¢ a page | Grounding already built; smallest prompt in the app. |
| 4 | **Deck strategy** | no | ~1.9¢ a deck | Wait until the readout tells us which parts people ask about. |
| 5 | **Cards / commanders** | **yes** | ~1.3¢ a question | The first feature that needs a proxy. |
| 6 | **Chat** | **yes** | ~0.5¢ a message | Last, hardest to keep honest, and the easiest to make worse than nothing. |
