/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../crankmagic-coach.js', import.meta.url), 'utf8');
const scope = vm.createContext({}); vm.runInContext(source, scope);
const {render, bind} = scope.CrankCoach;
let checks = 0;
const ok = (value, message) => {assert.ok(value, message); checks++;};
const eq = (actual, expected, message) => {assert.deepEqual(actual, expected, message); checks++;};
eq(render({open:false, available:true}), '', 'the caller can close the presenter without moving its state');
for (const available of [false, undefined, 'true']) {
  const html = render({available});
  ok(html.includes("The Coach isn't at this table yet.") && html.includes('href="#help"'), 'an unavailable service has an honest Help state');
  ok(!html.includes('<textarea') && !html.includes('data-coach-form'), 'no composer is manufactured without explicit backend availability');
}
const html = render({available:true, context:'Sees your board (hand withheld) <script>', tableId:'"<&', prompts:['Explain the stack', '<img onerror="bad">'],
  thread:[{from:'you',text:'<script>alert(1)</script>'},{from:'coach',text:'Try [[Sol Ring]] <img>',show:['Sol Ring'],plays:[{action:'Cast',card:'<A>',why:'<reason>'}],threat:{seat:'<seat>',why:'<why>'},open:true},{divider:'<turn>'},{from:'coach',text:'Sign in',signIn:true}],typing:true});
eq((html.match(/CrankMagic Coach/g)||[]).length, 1, 'the one-line title appears once');
ok(html.includes('h2 class="cm-section-title"') && !/<header[^>]*>[\s\S]*?<p>/.test(html.slice(0,html.indexOf('</header>'))), 'the compact header has no subtitle');
ok(html.includes('<b>Sol Ring</b>') && html.includes('&lt;img&gt;'), 'card brackets have limited bold formatting after escaping');
ok(!html.includes('<script>') && !html.includes('<img') && html.includes('&lt;turn&gt;') && html.includes('&lt;reason&gt;'), 'all message, divider, reasoning and context text is escaped');
ok(html.includes('data-q="&lt;img onerror=&quot;bad&quot;&gt;"'), 'question values cannot escape their attribute');
for (const hook of ['board-coach-show','board-coach-why','board-coach-clear','board-coach-ask','data-action="board-coach"','data-coach-form','cm-coach-input','cm-coach-thread','cm-coach-more']) ok(html.includes(hook), `existing board hook retained: ${hook}`);
ok(html.includes('/api/ai/login?to=') && !html.includes('id="<&'), 'the existing sign-in path safely encodes the return fragment');
ok(html.includes('id="cm-coach-context"') && html.includes('aria-describedby="cm-coach-context"'), 'the hand-sharing disclosure remains visible and associated with input');
ok(html.includes('<details class="cm-coach-questions"') && html.includes('aria-expanded="false"'), 'Questions starts as a native collapsed disclosure');
ok(!html.includes('cm-coach-prompts'), 'persistent prompt chips are replaced by the disclosure');
const attrs = {}, listeners = []; let focused = 0, inputFocused = 0;
const summary = {setAttribute:(key,value)=>attrs[key]=value,focus:()=>focused++};
const details = {open:true,querySelector:()=>summary};
const panel = {querySelector:()=>({focus:()=>inputFocused++}),querySelectorAll:()=>[details],addEventListener:(type,callback,capture)=>listeners.push({type,callback,capture})};
bind(panel); bind(panel);
eq(listeners.length, 3, 'binding the same host after redraw adds no duplicate listeners');
eq(attrs['aria-expanded'], 'true', 'bind synchronizes the native open state');
details.open = false; listeners.find(l=>l.type==='toggle').callback();
eq(attrs['aria-expanded'], 'false', 'native click/keyboard toggles synchronize the accessible state');
details.open = true; let prevented = 0, stopped = 0;
listeners.find(l=>l.type==='keydown').callback({key:'Escape',target:{closest:()=>details},preventDefault:()=>prevented++,stopPropagation:()=>stopped++});
eq([details.open, focused, prevented, stopped, attrs['aria-expanded']], [false,1,1,1,'false'], 'Escape closes the active disclosure, restores summary focus and preserves the containing Coach');
details.open = true; listeners.find(l=>l.type==='click').callback({target:{closest:()=>({closest:()=>details})}});
eq([details.open,inputFocused], [false,1], 'choosing a question folds the overlay and returns focus to the composer while retaining the delegated action');
console.log(`crankmagic-coach: ${checks} checks passed`);
