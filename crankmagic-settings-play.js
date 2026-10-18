/* SETTINGS' PLAY CARD (ROB-99, October 18, 2026).
 * Play and Workshop now own separate files. Keeping this card inside the general
 * Settings module made two sessions edit the same implementation.
 *
 * The Settings page calls settingsPlayCard with its existing section renderer.
 * This feature owns only Play markup and the handlers for its saved preferences.
 * It reads preferences each time Settings renders, so a changed account or a
 * saved preference cannot leave a captured value on screen.
 *
 * The alternative was a second Settings page. That would change navigation for
 * a file-ownership problem, so the existing page, section order and labels stay.
 * Step-by-step and overlay values keep the same preference keys and merge rules;
 * drawer configuration still opens the board's existing module editor.
 *
 * tests/settings-r3.mjs exercises the rendered card and persistence in Chromium.
 * The associated break removes this registration and must fail that suite.
 */
(globalThis.CrankFeatures ||= []).push(function(C){
const {button:b,actions,notice,commit}=C;
C.settingsPlayCard=card=>{
  const p=C.state.preferences||{},stepByStep=(p.play||{}).stepByStep===true;
  const overlay=Number.isFinite(Number((p.play||{}).overlay))?Math.min(100,Math.max(0,Number((p.play||{}).overlay))):60;
  return card('play','Play',
      `<div class="cm-settings-row"><button type="button" class="v-button cm-chip-toggle" data-action="set-step-by-step" aria-pressed="${stepByStep}">Stop at every step of my turn</button></div>`
      +`<div class="cm-settings-row">${C.sideDrawerSettings?b('Set Side Drawer Modules','board-modules-settings'):''}</div>`
      +`<p class="cm-settings-label">Overlay</p><div class="cm-settings-row"><label class="cm-settings-slider">Callouts over the table<input type="range" min="0" max="100" step="1" value="${overlay}" data-settings-overlay aria-label="Callouts over the table" aria-valuetext="${overlay===0?'off':overlay+'%'}"><output>${overlay===0?'Off':overlay+'%'}</output></label></div>`
      +`<p class="cm-muted">What just happened at the table, called out in a word over the board: an attack coming in, a hit, a spell countered, your turn. Off at the left; louder and longer toward the right. Reduce motion shows each one without its entrance.</p>`
      +`<p class="cm-muted">Off, a step of your turn with nothing in it for you to do passes by itself, and the table stops where there is something: a land to play, a spell you can pay for, an attack. On, it stops at every step (upkeep, draw, main, combat, the end step), and you move on from each one yourself. Either way your turn never ends by itself: in your end step the button reads End turn. At a table, from its next step.</p>`);
};
/* STOP AT EVERY STEP OF MY TURN (Rob, 2026-10-11): kept with the preferences (`play`), and told to the room by the board
   (crankmagic-board.js, prefer). */
actions['set-step-by-step']=async()=>{const play=(C.state.preferences||{}).play||{},on=play.stepByStep!==true;await commit({type:'preferences',values:{play:{...play,stepByStep:on}}});notice(on?'Your turn now stops at every step; you move on from each yourself.':'Steps of your turn with nothing to do pass by themselves again. Your turn still never ends without you.');};
/* THE OVERLAY (the callouts' loudness, 0 off to 100): a slider, previewed as it moves and saved when it is let go, with
   the rest of the Play preferences (crankmagic-board.js reads play.overlay). */
document.addEventListener('input',ev=>{const el=ev.target.closest?.('[data-settings-overlay]');if(!el)return;const n=Number(el.value);el.setAttribute('aria-valuetext',n===0?'off':n+'%');const out=el.parentElement.querySelector('output');if(out)out.textContent=n===0?'Off':n+'%';});
document.addEventListener('change',async ev=>{const el=ev.target.closest?.('[data-settings-overlay]');if(!el)return;const play=(C.state.preferences||{}).play||{},n=Math.min(100,Math.max(0,Math.round(Number(el.value)||0)));await commit({type:'preferences',values:{play:{...play,overlay:n}}},{renderView:false});notice(n===0?'Callouts off.':`Callouts at ${n}%.`);});
});
