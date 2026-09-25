/* THE SECOND PROCESS in `tests/engine-storage.mjs`'s resume proof (PLAN §3.8, 4.1b).
 *
 *   node tests/fixtures/engine-resume-child.mjs <store folder> <match id>
 *
 * It knows nothing but the folder: it opens the match store on disk, takes the latest checkpoint, plays the
 * game to its end, appends the events it wrote to the same journal, and prints what it reached as JSON.
 */
import {fileStorage} from "../../game/server/storage-fs.mjs";
import {createMatchStore} from "../../game/engine/storage.mjs";
import {hashState} from "../../game/engine/journal.mjs";
import {resumeGame, playOn} from "./engine-game.mjs";

const [dir, matchId] = process.argv.slice(2);
const store = createMatchStore(fileStorage(dir), matchId);
const point = await store.latestCheckpoint();
if (!point) throw new Error(`no checkpoint for ${matchId} in ${dir}`);
const game = resumeGame(point);
const decisions = playOn(game);
await store.appendEvents(game.journal.events());
process.stdout.write(JSON.stringify({pid: process.pid, resumedAt: point.sequence, decisions, hash: hashState(game.state), turn: game.state.turn, rng: game.rng.checkpoint()}));
