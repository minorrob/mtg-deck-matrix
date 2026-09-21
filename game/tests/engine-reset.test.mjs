/* A NEW GAME STARTS CLEAN.
 *
 * From Rob, 2026-09-21: "When a new game is started from the web app, I want any existing forge
 * instance to be restarted and evaluate what else, if another game was open, then abruptly
 * closed, how we can ensure when a new game starts, and lingering threads or systems running
 * don't create complications in a clean game start."
 *
 * He then hit it: "I had closed the forge window before launching this game, but still got this
 * error" — *A standalone match is already running. Finish or close its Forge window first.*
 *
 * Two different faults sat behind that one sentence.
 *
 * 1. REFUSING IS THE WRONG ANSWER. `launchLocalGame` only closed a previous engine when its
 *    status was already 'finished'; anything else threw and told the person to go and close a
 *    window themselves. Starting a game is the moment to make the machine ready, not the moment
 *    to hand out chores.
 *
 * 2. `childIsRunning` BELIEVED A STALE HANDLE. It read only `exitCode` and `signalCode` on the
 *    Node child object. Those stay null when the OS process is gone but Node has not reaped it —
 *    a JVM killed from Task Manager, a host that outlived its engine — so the launcher could
 *    refuse to start on behalf of a process that no longer exists. Asking the OS settles it.
 *
 * And the thing neither of those covers: an engine started by a PREVIOUS host process is invisible
 * to this one, because `running` lives in memory. Restarting `serve-review.mjs` orphans the JVM it
 * launched. `engineCommandLine` is how such a process is recognized — by the Forge jar and the
 * adapter classes it was started with, never by being called java.exe, so nothing unrelated on the
 * machine can match.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {childIsRunning, engineCommandLine} from '../tools/local-game-launcher.mjs';

test('a child Node has not reaped is still running', () => {
  assert.equal(childIsRunning({exitCode: null, signalCode: null}), true);
  assert.equal(childIsRunning({exitCode: 0, signalCode: null}), false);
  assert.equal(childIsRunning({exitCode: null, signalCode: 'SIGTERM'}), false);
  assert.equal(childIsRunning(null), false);
});

test('a handle whose process is gone is not running, whatever the handle says', () => {
  /* A pid that cannot exist. The handle still claims to be alive; the OS disagrees, and the OS
     is the one that knows. */
  assert.equal(childIsRunning({exitCode: null, signalCode: null, pid: 0x7ffffffe}), false,
    'this is the "I closed the Forge window but it says one is running" case');
});

test('our own engine is recognized by what it was started with', () => {
  const forge = 'C:/Users/rob/CrankMagic/forge';
  const classes = 'C:/Users/rob/CrankMagic/repo/game/.local/classes';
  const ours = `"C:/jdk/bin/java.exe" -cp ${classes};${forge}/forge-gui-desktop/target/forge-gui-desktop-2.0.15-jar-with-dependencies.jar crankmagic.ForgeLocalGame`;
  assert.equal(engineCommandLine(ours, {forge, classes}), true);
});

test('somebody else\'s Java is never ours', () => {
  const forge = 'C:/Users/rob/CrankMagic/forge';
  const classes = 'C:/Users/rob/CrankMagic/repo/game/.local/classes';
  for (const other of [
    '"C:/Program Files/Java/bin/java.exe" -jar C:/work/build-tool.jar',
    '"C:/jdk/bin/java.exe" -cp C:/elsewhere/forge-gui-desktop.jar some.other.Main',
    'java -version',
    '',
    null,
  ]) {
    assert.equal(engineCommandLine(other, {forge, classes}), false,
      `refused to claim: ${String(other).slice(0, 60)}`);
  }
});

test('a match needs both halves, so a coincidence cannot qualify', () => {
  const forge = 'C:/CrankMagic/forge';
  const classes = 'C:/CrankMagic/repo/game/.local/classes';
  /* the jar without our adapter classes is somebody running Forge on their own */
  assert.equal(engineCommandLine(`java -jar ${forge}/forge-gui-desktop/target/x.jar`, {forge, classes}), false);
  /* our classes without the jar is not an engine */
  assert.equal(engineCommandLine(`java -cp ${classes} crankmagic.ForgeProbe`, {forge, classes}), false);
});
