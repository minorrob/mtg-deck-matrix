/* DOES THE STARTING PLAYER DRAW ON TURN ONE?
 *
 * Stage A.5's open question, and the one docs/plan-board-onto-the-design-system.md predicted would
 * break. CR 103.8a: "In a two-player game, the player who plays first skips the draw step of their
 * first turn." There is NO equivalent clause for ordinary multiplayer -- so in a four-player
 * Commander pod everyone draws, including whoever goes first. The only live test so far was
 * heads-up, where skipping was correct, so the pod case has never been watched.
 *
 * Counting cards on screen cannot answer it, because a mulligan changes the opening hand and the
 * library together. What answers it is the CHANGE in a player's library between one sample and the
 * next: a draw is a library that went down by one. ForgeProbe publishes `count` for every zone of
 * every player including hidden cards, so this is exact for opponents as well as for you.
 *
 * READ ONLY. It clicks nothing and sends no action. Start it BEFORE pressing Start in the lobby,
 * or while the game is still on its mulligans, and leave it running through the first turn.
 *
 *   node tools/first-draw-check.mjs [seconds]
 */
import {pathToFileURL} from "node:url";

/* Turn 1's draw step is behind us once the game reaches any of these. */
export const PAST_DRAW = new Set(["MAIN1", "COMBAT_BEGIN", "COMBAT_DECLARE_ATTACKERS", "COMBAT_DECLARE_BLOCKERS",
  "COMBAT_FIRST_STRIKE_DAMAGE", "COMBAT_DAMAGE", "COMBAT_END", "MAIN2", "END_OF_TURN", "CLEANUP"]);

/* "NO DRAW SEEN" IS NOT THE SAME FACT AS "NO DRAW HAPPENED", and conflating them is how the first
 * version of this tool announced the bug it was hunting against a game that had not dealt its
 * opening hands yet. A verdict is only returned when the watch actually covered the moment it
 * judges; otherwise it says so and returns "unknown".
 */
export function firstDrawVerdict({seats, answered, starterDrew, starterName = "The starting player"}) {
  if (!answered) return {verdict: "unknown", correct: null,
    message: "Not answered · the game never got past turn 1's draw step while this was watching.\n" +
             "  That is not a missing draw, it is a missing observation. Give it longer."};
  if (seats === 2) return starterDrew
    ? {verdict: "wrong", correct: false, message: `WRONG · ${starterName} went first and DREW on turn 1. CR 103.8a says they skip it in a two-player game.`}
    : {verdict: "expected", correct: true, message: `Correct · ${starterName} went first and did not draw on turn 1, which is CR 103.8a.`};
  return starterDrew
    ? {verdict: "expected", correct: true, message: `Correct · ${starterName} went first and DREW on turn 1, which is right in a ${seats}-player pod.`}
    : {verdict: "wrong", correct: false,
       message: `THE BUG THIS WAS PREDICTED TO FIND · ${starterName} went first and did NOT draw on turn 1.\n` +
                `  CR 103.8a is a two-player rule; it must not apply at a pod. Report this run.`};
}

/* A run that starts after turn 1's draw step can never answer the question, so it should refuse up
   front rather than watch for minutes and then guess. */
export function canAnswerFrom(turn, phase) {
  if (turn > 1) return false;
  if (turn < 1) return true;                                   // still in setup or mulligans
  return ["NULL", "", "UNTAP", "UPKEEP"].includes(String(phase || "").toUpperCase());
}

async function main() {
  const HOST = process.env.CRANKMAGIC_HOST || "http://127.0.0.1:8768";
  const SECONDS = Number(process.argv[2] || 600);

  const setup = await fetch(`${HOST}/api/setup`).then((r) => r.json()).catch(() => null);
  if (!setup?.token) {
    console.error(`No local host is answering on ${HOST}. Start it, then start the pod from the lobby.`);
    return 1;
  }
  const view = () => fetch(`${HOST}/api/game-view`, {headers: {"X-Commander-Token": setup.token}}).then((r) => r.json());
  const live = await fetch(`${HOST}/api/live`).then((r) => r.json()).catch(() => null);
  if (!live || !["starting", "ready", "playing"].includes(live.status)) {
    console.error(`No game is playing on ${HOST} (status: ${live ? live.status : "no answer"}).`);
    return 1;
  }

  const first = await view();
  const seats = (first.state?.players || []).length;
  console.log(`Match ${live.matchId} · ${seats} players. Watching for ${SECONDS}s. Read only.`);
  console.log(seats === 2
    ? "Two players: CR 103.8a applies, so the player on the play SHOULD NOT draw on turn 1.\n"
    : `${seats} players: CR 103.8a does NOT apply, so EVERY player draws on their first turn, including whoever went first.\n`);

  if (!canAnswerFrom(first.state?.turn ?? 0, first.state?.phase)) {
    console.log(`Turn ${first.state?.turn}, ${first.state?.phase} — turn 1's draw step has already passed, so this run cannot answer the question.`);
    console.log("Start it before pressing Start in the lobby, or at the top of the next game.");
    return 2;
  }

  const names = new Map((first.state?.players || []).map((p) => [p.playerId, p.name]));
  const library = new Map((first.state?.players || []).map((p) => [p.playerId, p.zones?.Library?.count ?? null]));
  const drew = new Map();
  const deadline = Date.now() + SECONDS * 1000;
  let answered = false, lastTurn = first.state?.turn ?? 0;
  /* Started at turn 0, nobody is the turn player yet -- so remember who it turns out to be. */
  let firstTurnPlayer = first.state?.turn === 1 ? first.state?.turnPlayerId : null;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 400));
    let v; try { v = await view(); } catch { continue; }
    const state = v.state;
    if (!state?.players) continue;
    if (state.gameOver) { console.log("Game over."); break; }
    const turn = state.turn, phase = String(state.phase);
    if (turn !== lastTurn) lastTurn = turn;
    if (turn === 1 && firstTurnPlayer == null && state.turnPlayerId != null) firstTurnPlayer = state.turnPlayerId;

    for (const p of state.players) {
      const now = p.zones?.Library?.count, before = library.get(p.playerId);
      if (typeof now !== "number" || typeof before !== "number") { library.set(p.playerId, now ?? null); continue; }
      if (now < before) {
        const n = before - now;
        /* A draw is the ordinary case; a larger fall is a draw effect or a mill, and saying which
           is not this tool's job -- reporting the number honestly is. */
        console.log(`  turn ${turn} · ${phase} · ${names.get(p.playerId)} library ${before} → ${now} (${n} card${n === 1 ? "" : "s"})`);
        if (!drew.has(p.playerId)) drew.set(p.playerId, []);
        drew.get(p.playerId).push({turn, phase, n});
      }
      library.set(p.playerId, now);
    }
    if (turn > 1 || (turn === 1 && PAST_DRAW.has(phase.toUpperCase()))) answered = true;
    if (turn > seats) { console.log("\nEvery player has had a turn."); break; }
  }

  const starter = firstTurnPlayer ?? first.state?.turnPlayerId ?? (first.state?.players || [])[0]?.playerId;
  const starterDrew = (drew.get(starter) || []).some((d) => d.turn === 1 && /DRAW/i.test(d.phase));
  const answer = firstDrawVerdict({seats, answered, starterDrew, starterName: names.get(starter) || "The starting player"});
  console.log("\nTHE ANSWER\n  " + answer.message);
  if (answer.verdict === "unknown") { console.log("      node tools/first-draw-check.mjs 900"); return 2; }
  for (const [id, list] of drew) console.log(`  ${names.get(id)}: ${list.map((d) => `T${d.turn} ${d.phase}`).join(", ")}`);
  return answer.correct ? 0 : 3;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) process.exit(await main());
