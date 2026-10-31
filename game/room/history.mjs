/* THE TABLE'S HISTORY (M5; the handoff's History drop-down and the Focus mat's history band).
 *
 * The engine says what happened as Forge-shaped events (GameEvent*), each carrying the turn and the phase. This
 * turns them into short lines anyone at the table may read, as the room writes them, so there is one history
 * for everyone and nothing in it depends on who is looking.
 *
 * WHAT NOBODY IS TOLD. A card that moves between two hidden zones (a library and a hand) is never named: a
 * draw is "Rob drew a card", however many. Everything else it names was, or has just become, public: a land
 * played, a spell cast, a card revealed, discarded, milled, destroyed or exiled.
 *
 * Left out, as noise: tapping, mana, shuffles, and the steps of a turn (the turn itself is a line).
 *
 * A line: {turn, seq, text, mark?, actor?, source?, targets?, modes?, cards?} (docs/ui-lane/history-and-targets-contract.md; Linear
 * ROB-327 and ROB-332). `text` is the sentence; the rest is the same sentence as data, so the board can say who acted, with what and
 * to whom, and can hover each card named in it: `actor` the playerId, `source` the card that acted `{name, ref}`, `targets` what it was
 * aimed at or dealt to (Aims, game/engine/aims.mjs: as they were when the line was written), `modes` a modal spell's chosen modes and
 * their targets, `cards` every public card named in `text`, in order of appearance. `seq` numbers the lines from 0, for good.
 * Draws by the same player in a row are one line whose count grows.
 */

const HIDDEN = new Set(["Library", "Hand"]);
export const HISTORY_LIMIT = 300;

const cardName = (card) => (card && !card.faceDown && card.name ? card.name : "a face-down card");
/* A card the table may name: public, with a name. */
const named = (card) => Boolean(card && !card.faceDown && card.name);
const refOf = (card) => ({name: card.name, ref: Number.isInteger(card.cardId) ? card.cardId : null});
/* "A", "A and B", "A, B and C". */
const listed = (words) => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`);

/** The lines one event adds. `names[i]` is seat i's name at the table. */
export function historyLines(event, names = []) {
  const {kind, data} = event || {};
  const f = (data && data.fields) || {}, turn = (data && data.turn) || 0;
  const who = (id) => names[id] ?? `Seat ${Number(id) + 1}`;
  /* Every public card the sentence names, in the order it names them: a card said through `mention` (or a target through
     `aimWords`) is in the line's `cards`; a face-down card is not, and is said as "a face-down card". */
  const cards = [];
  const mention = (card) => {if (named(card)) cards.push(refOf(card)); return cardName(card);};
  const aimWords = (aims) => listed(aims.map((a) => {
    if (a.kind === "object" && a.name) cards.push({name: a.name, ref: Number.isInteger(a.id) ? a.id : null});
    return a.name ?? "a face-down card";
  }));
  const line = (text, extra = {}) => [{turn, text, ...extra, ...(cards.length ? {cards: [...cards]} : {})}];
  const src = (card) => (named(card) ? {source: refOf(card)} : {});
  const by = (id) => (Number.isInteger(id) ? {actor: id} : {});
  /* What a cast or an activation was aimed at (aims.mjs, carried on the event): " targeting A and B" or, for a modal one,
     ": <mode> → A; <mode> → B". Nothing for one with no target. Said after the rest of the sentence is, so `cards` stays in order. */
  const aimedAt = () => {
    const aimed = Array.isArray(f.aimed) ? f.aimed : [], modes = Array.isArray(f.aimedModes) ? f.aimedModes : [];
    if (modes.length) return {words: `: ${modes.map((m) => `${m.text} → ${aimWords(m.aimed)}`).join("; ")}`, extra: {targets: aimed, modes: modes.map((m) => ({text: m.text, targets: m.aimed}))}};
    return aimed.length ? {words: ` targeting ${aimWords(aimed)}`, extra: {targets: aimed}} : {words: "", extra: {}};
  };
  switch (kind) {
    case "GameEventTurnPhase":
      /* An extra turn (CR 500.7) says so. */
      return f.phase === "UNTAP" && f.playerTurn ? line(`Turn ${turn} · ${who(f.playerTurn.playerId)}${f.extraTurn ? " (an extra turn)" : ""}`, {mark: "turn", ...by(f.playerTurn.playerId)}) : [];
    /* A designation (CR 701.37b, 722.3): monstrous, prepared or unprepared -- public. */
    case "GameEventCardAttribute":
      return line(f.attribute === "monstrous" ? `${mention(f.card)} became monstrous` : `${mention(f.card)} ${f.value ? "became prepared" : "is no longer prepared"}`, src(f.card));
    case "GameEventLandPlayed":
      return line(`${who(f.player.playerId)} played ${mention(f.land)}`, {...by(f.player.playerId), ...src(f.land)});
    case "GameEventSpellAbilityCast": {
      const actor = f.si?.actor?.playerId;
      if (f.sa && f.sa.isSpell) {
        const head = `${who(actor)} cast ${mention(f.card)}`, aim = aimedAt();
        return line(`${head}${aim.words}`, {...by(actor), ...src(f.card), ...aim.extra});
      }
      /* An activated ability (ROB-327): by whom, whose, and at what. (A triggered one goes on the stack by no event that says
         its targets; docs/ui-lane/history-and-targets-contract.md, §5.) */
      if (f.sa && f.si && !f.si.isTrigger) {
        const head = `${who(actor)} activated ${named(f.card) ? `${mention(f.card)}'s` : "a face-down card's"} ability`, aim = aimedAt();
        return line(`${head}${aim.words}`, {...by(actor), ...src(f.card), ...aim.extra});
      }
      return [];
    }
    case "GameEventSpellCopied":
      return line(`${who(f.playerId)} copied ${mention(f.card)}`, {...by(f.playerId), ...src(f.card)});
    /* A number chosen at random (Tibalt's Trickery): no die. */
    case "GameEventNumberChosen":
      return line(`${who(f.player?.playerId)} chose ${f.result} at random`, by(f.player?.playerId));
    /* An ability copied on the stack (CR 707.10; Strionic Resonator): named by its source. */
    case "GameEventAbilityCopied":
      return line(`${who(f.playerId)} copied ${f.name ? `${f.name}'s ability` : "an ability"}`, by(f.playerId));
    /* A spell that had targets and has none left (CR 608.2b) does nothing: said so, with no name for what it was aimed at. */
    case "GameEventSpellResolved": {
      if (!f.card) return [];
      const spell = f.kind === undefined || f.kind === "spell";
      if (f.hasFizzled) return line(`${mention(f.card)}${spell ? "" : "'s ability"} fizzled: its target is gone`, src(f.card));
      return line(`${mention(f.card)} resolved`, src(f.card));
    }
    case "GameEventCardChangeZone": {
      const from = f.from && f.from.zoneType, to = f.to && f.to.zoneType, owner = f.card ? f.card.owner : undefined;
      if (from === "Library" && to === "Hand") return [{turn, text: "", n: 1, who: owner, draw: true}];
      if (HIDDEN.has(from) && HIDDEN.has(to)) return [];
      /* Already said by the land played, the spell cast, or the spell resolved. */
      if ((from === "Hand" || from === "Command") && (to === "Stack" || to === "Battlefield")) return [];
      if (from === "Stack") return [];
      const name = mention(f.card), one = src(f.card);
      if (to === "Graveyard") return line(from === "Hand" ? `${who(owner)} discarded ${name}` : from === "Library" ? `${name} was milled` : `${name} went to the graveyard`, from === "Hand" ? {...by(owner), ...one} : one);
      if (to === "Exile") return line(`${name} was exiled`, one);
      if (to === "Command") return line(`${name} returned to the command zone`, one);
      if (to === "Battlefield") return line(`${name} entered the battlefield`, one);
      if (to === "Hand") return line(`${name} returned to ${who(owner)}'s hand`, one);
      if (to === "Library") return line(`${name} was put into ${who(owner)}'s library`, one);
      return [];
    }
    case "GameEventPlayerLivesChanged":
      if (f.lost) return line(`${who(f.player.playerId)} lost the game${f.lossReason ? ` (${f.lossReason})` : ""}`, by(f.player.playerId));
      return f.oldLives === f.newLives ? [] : line(`${who(f.player.playerId)}: ${f.oldLives} → ${f.newLives} life`, by(f.player.playerId));
    case "GameEventPlayerDamaged":
      return line(`${mention(f.source)} dealt ${f.amount} to ${who(f.target.playerId)}`, {...src(f.source), targets: [{kind: "player", id: f.target.playerId, name: who(f.target.playerId)}]});
    case "GameEventCardDamaged": {
      const dealer = f.source ? mention(f.source) : "Damage", hit = mention(f.card);
      return line(`${dealer} dealt ${f.amount} to ${hit}`, {...src(f.source), ...(named(f.card) ? {targets: [{kind: "object", id: f.card.cardId ?? null, name: f.card.name}]} : {})});
    }
    case "GameEventAttackersDeclared": {
      const all = f.attackers || [];
      if (!all.length) return [];
      const defender = (a) => (a.defender && Number.isInteger(a.defender.playerId) ? a.defender.playerId : null);
      /* Whom each attacked, said when the event says (Rob, 2026-10-30: "by whom with what and to whom with what"): "Rob attacked
         Maya with Bear, Wolf; Sam with Elf". An attacker whose defender is not said is listed after "with". */
      const groups = [];
      for (const a of all) {
        const d = defender(a), group = groups.find((g) => g.d === d);
        if (group) group.cards.push(a.card); else groups.push({d, cards: [a.card]});
      }
      const said = groups.every((g) => g.d !== null)
        ? groups.map((g, i) => `${i === 0 ? `${who(f.player.playerId)} attacked ` : ""}${who(g.d)} with ${g.cards.map(mention).join(", ")}`).join("; ")
        : `${who(f.player.playerId)} attacked with ${all.map((a) => mention(a.card)).join(", ")}`;
      const targets = groups.filter((g) => g.d !== null).map((g) => ({kind: "player", id: g.d, name: who(g.d)}));
      return line(said, {...by(f.player.playerId), ...(targets.length ? {targets} : {})});
    }
    case "GameEventBlockersDeclared": {
      const blocks = (f.blockers || []).map((b) => `${mention(b.card)} blocked ${mention(b.blocking)}`);
      return blocks.length ? line(`${who(f.player.playerId)}: ${blocks.join(", ")}`, by(f.player.playerId)) : [];
    }
    /* A card revealed (CR 701.20a) -- from a library, from a hand (Render Speechless's "target opponent reveals their hand"),
       as a cost -- is shown to every player, so it is named. */
    case "GameEventCardRevealed":
      return line(`${who(f.player.playerId)} revealed ${mention(f.card)}`, {...by(f.player.playerId), ...src(f.card)});
    /* A double-faced permanent turned over (CR 701.27a): both faces are public, so both are named. */
    case "GameEventCardTransformed": {
      const before = f.from ? (cards.push({name: f.from, ref: null}), f.from) : "A permanent";
      return line(`${before} transformed into ${mention(f.card)}`, src(f.card));
    }
    /* A face-down permanent turned face up (CR 701.40b, 708.8): its card is shown to everyone as it is, so it is named now. */
    case "GameEventCardTurnedFaceUp":
      return line(`${who(f.player.playerId)} turned ${mention(f.card)} face up`, {...by(f.player.playerId), ...src(f.card)});
    /* The monarch (CR 725.3): a designation of the game's, and public. */
    case "GameEventBecomeMonarch":
      return line(`${who(f.player.playerId)} became the monarch`, by(f.player.playerId));
    /* A die rolled (CR 706.1; Ancient Copper Dragon): the roll and its result, which every player sees. */
    case "GameEventDieRolled":
      return line(`${who(f.player.playerId)} rolled a d${f.sides}: ${f.result}`, by(f.player.playerId));
    /* A Class's level (CR 716.2a). */
    case "GameEventCardLevel":
      return line(`${mention(f.card)} reached level ${f.newValue}`, src(f.card));
    case "GameEventGameOutcome":
      return line(f.winner === null || f.winner === undefined ? "The game is over: no one is left" : `${who(f.winner)} won`, {mark: "end", ...(Number.isInteger(f.winner) ? by(f.winner) : {})});
    default:
      return [];
  }
}

/** A draw line's words. */
const drawText = (names, l) => `${names[l.who] ?? `Seat ${Number(l.who) + 1}`} drew ${l.n === 1 ? "a card" : `${l.n} cards`}`;

/** The next line's `seq`: one past the newest line's, 0 for the game's first. Lines are numbered for good (never reused). */
export const nextSeq = (history) => (history.length ? (history[history.length - 1].seq ?? history.length - 1) + 1 : 0);

/** Add a line the room writes itself (a quiet step, a concession) to a history, numbered. */
export function pushLine(history, line) {
  history.push({...line, seq: nextSeq(history)});
  return history;
}

/**
 * Add an event's lines to a history, in place: draws by the same player in a row are counted on one line, every line is
 * numbered (`seq`), and the history keeps its newest `keep` lines (HISTORY_LIMIT unless the room, which keeps the whole game,
 * says otherwise).
 */
export function addToHistory(history, event, names = [], {keep = HISTORY_LIMIT} = {}) {
  for (const l of historyLines(event, names)) {
    const last = history[history.length - 1];
    if (l.draw && last && last.draw && last.who === l.who && last.turn === l.turn) {last.n += 1; last.text = drawText(names, last); continue;}
    pushLine(history, l.draw ? {...l, text: drawText(names, l)} : l);
  }
  if (history.length > keep) history.splice(0, history.length - keep);
  return history;
}
