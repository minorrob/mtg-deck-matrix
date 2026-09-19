import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');

test('serve-review.mjs redirects root to live game setup',async()=>{
  // Verify that the server source contains the redirect from / to /app/#game
  // This prevents users from getting stuck on "Loading recorded game..." when opening the host
  const source=await readFile(resolve(root,'game/tools/serve-review.mjs'),'utf-8');
  
  // Check that the files map no longer includes '/' → review.html
  assert.ok(!source.includes("['/',['game/ui/review.html','text/html']]"),
    'Root path should not be mapped to review.html');
  
  // Check that /review is mapped instead
  assert.ok(source.includes("['/review',['game/ui/review.html','text/html']]"),
    'Review should be available at /review path');
  
  // Check that there's a redirect handler for root
  assert.ok(source.includes("pathname==='/'")&&source.includes("'/app/#game'"),
    'Root path should redirect to /app/#game');
  
  assert.ok(source.includes("res.writeHead(302"),"Redirect should use 302 status");
});

test('review.html page contains game UI with neutral initial state',async()=>{
  // Verify the review page has neutral initial state that works for both guest and recorded modes
  // The JavaScript (review.mjs) sets the appropriate mode-specific text dynamically:
  //   - Guest mode: "CONNECTING TO TABLE…" → "LIVE TABLE · INVITED SEAT"
  //   - Recorded mode: "RECORDED TABLE" 
  //   - Live host mode: "LIVE TABLE · LOCAL HOST"
  const html=await readFile(resolve(root,'game/ui/review.html'),'utf-8');
  assert.ok(html.includes('LOADING…'),'Review page should have neutral loading state');
  assert.ok(html.includes('Loading…'),'Review page should show neutral loading message');
  assert.ok(html.includes('Game setup'),'Review page should have game setup button');
});

test('Host URLs are documented correctly',async()=>{
  // Verify that documentation explains the different URL paths
  const howTo=await readFile(resolve(root,'game/docs/HOW-TO-START-CRANKMAGIC-ONLINE.md'),'utf-8');
  const quickStart=await readFile(resolve(root,'game/docs/CRANKMAGIC-ONLINE-QUICK-START.md'),'utf-8');
  
  // Check that /app/#game is documented as the primary entry point
  assert.ok(howTo.includes('http://127.0.0.1:8768/app/#game'),
    'HOW-TO should reference the live game setup URL');
  assert.ok(quickStart.includes('http://127.0.0.1:8768/app/#game'),
    'Quick start should reference the live game setup URL');
  
  // Check that the redirect behavior is documented
  assert.ok(howTo.includes('automatically redirects')||quickStart.includes('automatically redirects'),
    'Documentation should explain the root redirect behavior');
});
