/* SETTINGS' PLAY CARD (ROB-99, October 18, 2026; ROB-124, play preferences, October 18, 2026).
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
 * ROB-124 adds confirmations (confirm cast), auto-pass scope, camera defaults per view,
 * and sound defaults, all stored in C.state.preferences.play and applied when a table opens.
 * Existing defaults (tilt 40°, sfx 0.5, bgm 0.18, muted false, stepByStep false, overlay 60)
 * are preserved; tests/settings-play-prefs.mjs proves this with deliberate mutations.
 *
 * tests/settings-r3.mjs exercises the original card and persistence in Chromium.
 * The associated break removes this registration and must fail that suite.
 */
(globalThis.CrankFeatures ||= []).push(function(C){
const {button:b,actions,notice,commit,esc:e,select:s}=C;
/* PLAY PREFERENCES DEFAULTS (ROB-124): existing defaults stay unchanged. */
const PLAY_DEFAULTS={stepByStep:false,overlay:60,confirmCast:false,autoPassScope:'never',camera:{tilt:40,zoom:100,cards:100},sound:{sfx:0.5,bgm:0.18,muted:false}};
const playPrefs=()=>{const raw=(C.state.preferences||{}).play||{};return {stepByStep:raw.stepByStep===true,overlay:Number.isFinite(Number(raw.overlay))?Math.min(100,Math.max(0,Number(raw.overlay))):PLAY_DEFAULTS.overlay,confirmCast:raw.confirmCast===true,autoPassScope:['never','empty-stack','end-of-turn'].includes(raw.autoPassScope)?raw.autoPassScope:PLAY_DEFAULTS.autoPassScope,camera:{tilt:Number.isFinite(Number(raw.camera?.tilt))?Math.min(60,Math.max(0,Number(raw.camera.tilt))):PLAY_DEFAULTS.camera.tilt,zoom:Number.isFinite(Number(raw.camera?.zoom))?Math.min(120,Math.max(60,Number(raw.camera.zoom))):PLAY_DEFAULTS.camera.zoom,cards:Number.isFinite(Number(raw.camera?.cards))?Math.min(150,Math.max(70,Number(raw.camera.cards))):PLAY_DEFAULTS.camera.cards},sound:{sfx:Number.isFinite(Number(raw.sound?.sfx))&&raw.sound.sfx>=0&&raw.sound.sfx<=1?Number(raw.sound.sfx):PLAY_DEFAULTS.sound.sfx,bgm:Number.isFinite(Number(raw.sound?.bgm))&&raw.sound.bgm>=0&&raw.sound.bgm<=1?Number(raw.sound.bgm):PLAY_DEFAULTS.sound.bgm,muted:raw.sound?.muted===true}};};
C.playPrefs=playPrefs;C.PLAY_DEFAULTS=PLAY_DEFAULTS;
C.settingsPlayCard=card=>{
  const p=playPrefs();
  return card('play','Play',
      `<p class="cm-settings-label">Overlay</p><div class="cm-settings-row"><label class="cm-settings-slider">Callouts over the table<input type="range" min="0" max="100" step="1" value="${p.overlay}" data-settings-overlay aria-label="Callouts over the table" aria-valuetext="${p.overlay===0?'off':p.overlay+'%'}"><output data-overlay-output>${p.overlay===0?'Off':p.overlay+'%'}</output></label></div>`
      +`<p class="cm-muted">What just happened at the table, called out in a word over the board: an attack coming in, a hit, a spell countered, your turn. Off at the left; louder and longer toward the right. Reduce motion shows each one without its entrance.</p>`
      +`<p class="cm-settings-label">Turn flow</p>`
      +`<div class="cm-settings-row"><button type="button" class="v-button cm-chip-toggle" data-action="set-step-by-step" aria-pressed="${p.stepByStep}">Stop at every step of my turn</button></div>`
      +`<p class="cm-muted">Off, a step of your turn with nothing in it for you to do passes by itself, and the table stops where there is something: a land to play, a spell you can pay for, an attack. On, it stops at every step (upkeep, draw, main, combat, the end step), and you move on from each one yourself. Either way your turn never ends by itself: in your end step the button reads End turn.</p>`
      +`<p class="cm-settings-label">Confirmations</p>`
      +`<div class="cm-settings-row"><button type="button" class="v-button cm-chip-toggle" data-action="set-confirm-cast" aria-pressed="${p.confirmCast}">Confirm before casting a spell</button></div>`
      +`<p class="cm-muted">On, the board asks before submitting a cast action to the room. Off, a chosen spell is cast at once. Ending your turn always asks.</p>`
      +`<p class="cm-settings-label">Auto-pass priority</p>`
      +`<div class="cm-settings-row"><label class="cm-settings-select">When to pass automatically <select data-settings-autopass aria-label="Auto-pass scope">`
      +`<option value="never"${p.autoPassScope==='never'?' selected':''}>Never: always ask</option>`
      +`<option value="empty-stack"${p.autoPassScope==='empty-stack'?' selected':''}>When the stack is empty</option>`
      +`<option value="end-of-turn"${p.autoPassScope==='end-of-turn'?' selected':''}>Through the end of turn</option>`
      +`</select></label></div>`
      +`<p class="cm-muted">Within the engine's rules: never answering a required choice. Never applies to your own end step, which always asks.</p>`
      +`<p class="cm-settings-label">Camera</p>`
      +`<div class="cm-settings-row"><label class="cm-settings-slider">Default tilt<input type="range" min="0" max="60" step="1" value="${p.camera.tilt}" data-settings-camera="tilt" aria-label="Camera tilt" aria-valuetext="${p.camera.tilt}°"><output>${p.camera.tilt}°</output></label></div>`
      +`<div class="cm-settings-row"><label class="cm-settings-slider">Default zoom<input type="range" min="60" max="120" step="1" value="${p.camera.zoom}" data-settings-camera="zoom" aria-label="Camera zoom" aria-valuetext="${p.camera.zoom}%"><output>${p.camera.zoom}%</output></label></div>`
      +`<div class="cm-settings-row"><label class="cm-settings-slider">Default card size<input type="range" min="70" max="150" step="1" value="${p.camera.cards}" data-settings-camera="cards" aria-label="Card size" aria-valuetext="${p.camera.cards}%"><output>${p.camera.cards}%</output></label></div>`
      +`<p class="cm-muted">The camera's starting angles when a table opens. At the table, Camera in Tools adjusts them for this session.</p>`
      +`<p class="cm-settings-label">Sound</p>`
      +`<div class="cm-settings-row"><label class="cm-settings-slider">Effects<input type="range" min="0" max="100" step="1" value="${Math.round(p.sound.sfx*100)}" data-settings-sound="sfx" aria-label="Sound effects volume" aria-valuetext="${Math.round(p.sound.sfx*100)}%"><output>${Math.round(p.sound.sfx*100)}%</output></label></div>`
      +`<div class="cm-settings-row"><label class="cm-settings-slider">Music<input type="range" min="0" max="100" step="1" value="${Math.round(p.sound.bgm*100)}" data-settings-sound="bgm" aria-label="Music volume" aria-valuetext="${Math.round(p.sound.bgm*100)}%"><output>${Math.round(p.sound.bgm*100)}%</output></label></div>`
      +`<div class="cm-settings-row"><button type="button" class="v-button cm-chip-toggle" data-action="set-sound-muted" aria-pressed="${p.sound.muted}">Mute all sound</button></div>`
      +`<p class="cm-muted">The starting volume when a table opens. At the table, Sound in Tools adjusts them for this session.</p>`
      +`<div class="cm-settings-row">${C.sideDrawerSettings?b('Set Side Drawer Modules','board-modules-settings'):''}</div>`);
};
/* STOP AT EVERY STEP OF MY TURN (Rob, 2026-10-11): kept with the preferences (`play`), and told to the room by the board
   (crankmagic-board.js, prefer). */
actions['set-step-by-step']=async()=>{const play=(C.state.preferences||{}).play||{},on=play.stepByStep!==true;await commit({type:'preferences',values:{play:{...play,stepByStep:on}}});notice(on?'Your turn now stops at every step; you move on from each yourself.':'Steps of your turn with nothing to do pass by themselves again. Your turn still never ends without you.');};
/* CONFIRM BEFORE CASTING A SPELL (ROB-124): off by default, saved with the Play preferences. */
actions['set-confirm-cast']=async()=>{const play=(C.state.preferences||{}).play||{},on=play.confirmCast!==true;await commit({type:'preferences',values:{play:{...play,confirmCast:on}}});notice(on?'The board will ask before casting a spell.':'Chosen spells are cast at once again.');};
/* MUTE ALL SOUND (ROB-124): saved with the Play preferences (play.sound.muted). */
actions['set-sound-muted']=async()=>{const play=(C.state.preferences||{}).play||{},sound=play.sound||{},on=sound.muted!==true;await commit({type:'preferences',values:{play:{...play,sound:{...sound,muted:on}}}});notice(on?'Sound muted.':'Sound on.');};
/* AUTO-PASS SCOPE (ROB-124): when to pass priority automatically, within the engine's rules. */
document.addEventListener('change',async ev=>{const el=ev.target.closest?.('[data-settings-autopass]');if(!el)return;const play=(C.state.preferences||{}).play||{},scope=['never','empty-stack','end-of-turn'].includes(el.value)?el.value:'never';await commit({type:'preferences',values:{play:{...play,autoPassScope:scope}}},{renderView:false});const label={'never':'Auto-pass: never.','empty-stack':'Auto-pass when the stack is empty.','end-of-turn':'Auto-pass through the end of turn.'}[scope];notice(label||'Auto-pass set.');});
/* CAMERA DEFAULTS (ROB-124): sliders for tilt, zoom, and card size, previewed as they move and saved when let go. */
document.addEventListener('input',ev=>{const el=ev.target.closest?.('[data-settings-camera]');if(!el)return;const n=Number(el.value),unit=el.dataset.settingsCamera==='tilt'?'°':'%';el.setAttribute('aria-valuetext',n+unit);const out=el.parentElement.querySelector('output');if(out)out.textContent=n+unit;});
document.addEventListener('change',async ev=>{const el=ev.target.closest?.('[data-settings-camera]');if(!el)return;const play=(C.state.preferences||{}).play||{},camera=play.camera||{},key=el.dataset.settingsCamera,n=Math.round(Number(el.value)||0);const bounds={tilt:[0,60],zoom:[60,120],cards:[70,150]},b=bounds[key]||[0,100],clamped=Math.min(b[1],Math.max(b[0],n));await commit({type:'preferences',values:{play:{...play,camera:{...camera,[key]:clamped}}}},{renderView:false});const labels={tilt:'Camera tilt',zoom:'Camera zoom',cards:'Card size'};notice(`${labels[key]||'Camera'} default: ${clamped}${key==='tilt'?'°':'%'}.`);});
/* SOUND VOLUME (ROB-124): sliders for sfx and bgm (0-100%, stored as 0-1), saved when let go. */
document.addEventListener('input',ev=>{const el=ev.target.closest?.('[data-settings-sound]');if(!el)return;const n=Number(el.value);el.setAttribute('aria-valuetext',n+'%');const out=el.parentElement.querySelector('output');if(out)out.textContent=n+'%';});
document.addEventListener('change',async ev=>{const el=ev.target.closest?.('[data-settings-sound]');if(!el)return;const play=(C.state.preferences||{}).play||{},sound=play.sound||{},key=el.dataset.settingsSound,pct=Math.min(100,Math.max(0,Math.round(Number(el.value)||0))),value=pct/100;await commit({type:'preferences',values:{play:{...play,sound:{...sound,[key]:value}}}},{renderView:false});const labels={sfx:'Effects',bgm:'Music'};notice(`${labels[key]||'Volume'}: ${pct}%.`);});
/* THE OVERLAY (the callouts' loudness, 0 off to 100): a slider, previewed as it moves and saved when it is let go, with
   the rest of the Play preferences (crankmagic-board.js reads play.overlay). */
document.addEventListener('input',ev=>{const el=ev.target.closest?.('[data-settings-overlay]');if(!el)return;const n=Number(el.value);el.setAttribute('aria-valuetext',n===0?'off':n+'%');const out=el.parentElement.querySelector('[data-overlay-output]');if(out)out.textContent=n===0?'Off':n+'%';});
document.addEventListener('change',async ev=>{const el=ev.target.closest?.('[data-settings-overlay]');if(!el)return;const play=(C.state.preferences||{}).play||{},n=Math.min(100,Math.max(0,Math.round(Number(el.value)||0)));await commit({type:'preferences',values:{play:{...play,overlay:n}}},{renderView:false});notice(n===0?'Callouts off.':`Callouts at ${n}%.`);});
});
