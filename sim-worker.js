/* The simulator, off the main thread.
 *
 * A published measurement is six seeds of 20,000 games and takes a few seconds of solid
 * arithmetic. On the main thread that is a few seconds where the page does not scroll,
 * buttons do not depress and the tab is a candidate for "this page is slowing down your
 * browser". So it runs here, and the page stays a page.
 *
 * The review asked for exactly this: "Use Web Workers for bounded batches, cancellation
 * and progress." Progress is real -- deck-measure's measure() calls back after each seed,
 * so the reader watches the score converge rather than a spinner turn. Cancellation is
 * termination: measure() loops its seeds synchronously and there is no other way in, so
 * crankmagic-sim.js kills the worker and spawns a fresh one next time.
 *
 * The engine scripts are named by the caller rather than hard-coded here, so there is one
 * list of ?v= versions (crankmagic-sim.js) instead of two that can disagree. importScripts
 * is same-origin, which the page's CSP allows and which is the only place these come from.
 */
"use strict";

let loaded = false;

function load(scripts) {
  if (loaded) return;
  // sim-engine first: deck-measure throws on load without it. combat and pilot-policy
  // before deck-measure, which resolves them lazily off the global scope.
  self.importScripts.apply(self, scripts);
  if (!self.MtgDeckMeasure) throw new Error("deck-measure.js did not attach to the worker scope.");
  loaded = true;
}

self.onmessage = function (event) {
  const request = event.data || {};
  if (request.type !== "measure") return;
  const id = request.id;
  try {
    load(request.scripts);
    const Measure = self.MtgDeckMeasure;

    /* hydrate() with no facts table reads each entry's own `card`, which is the
       CrankMagic catalog row the app attached. One source of card facts, not two. */
    const cards = Measure.hydrate(request.lineup, null);

    /* Seats are built here rather than on the page so the page never has to load
       deck-measure.js just to turn an opponent table into weighted seats -- which
       would put the whole engine back on the main thread to avoid running it there. */
    const seats = request.seats || Measure.buildSeats(request.opponents, request.table);

    const result = Measure.measure(cards, {
      config: request.config,
      seats: seats,
      seedCount: request.seedCount,
      games: request.games,
      onSeed: function (done, total, runningMean) {
        self.postMessage({id, type: "progress", done, total, mean: runningMean});
      }
    });

    self.postMessage({id, type: "done", result});
  } catch (error) {
    self.postMessage({id, type: "error", message: error && error.message ? error.message : String(error)});
  }
};
