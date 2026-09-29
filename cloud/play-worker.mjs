/* PLAY'S WORKER (M5): the API Worker (cloud/worker.mjs) and, beside it, the table as a Durable Object
 * (cloud/game-room.mjs, GameTable), which carries the rules engine. Only a release profile with Play in it runs
 * this file (tools/release-pages.mjs, `tables`); every other release runs cloud/worker.mjs, which imports
 * nothing from game/ and so ships no engine. The platform finds a Durable Object's class among the main
 * module's exports, hence this one-line difference. */
export {default} from "./worker.mjs";
export {GameTable} from "./game-room.mjs";
