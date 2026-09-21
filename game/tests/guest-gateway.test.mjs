import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {createGuestGateway,GUEST_ROUTE_KEYS} from '../server/guest-gateway.mjs';

const make=async(extra)=>{
  const calls=[],member={tableId:'table-a',seatId:2,generation:4};
  const service={
    authenticate:async token=>{if(token!=='seat-secret')throw Object.assign(Error('Seat session required'),{status:401});return member;},
    join:async input=>{calls.push(['join',input]);return {capability:'seat-secret',seatId:2};},
    table:async who=>({who}),deck:async(who,input)=>({who,input}),ready:async(who,input)=>({who,input}),heartbeat:async who=>({who}),exit:async who=>({who}),rematch:async(who,input)=>({who,input}),view:async who=>({viewerSeatId:who.seatId}),action:async(who,input)=>({who,input}),report:async who=>({viewerSeatId:who.seatId,schema:'CrankMagicOnlineMatchReport@1'}),feedback:async(who,input)=>({who,input})
  };
  const gateway=createGuestGateway({...(extra||{}),service,readPublicFile:async name=>name==='guest.html'?'<h1>Join</h1>':'export default true'}),info=await gateway.listen();
  return {gateway,info,calls};
};
const request=(origin,path,options={})=>fetch(origin+path,options);
const rawRequest=(info,path,{method='GET',headers={},body=''}={})=>new Promise((resolve,reject)=>{
  const req=httpRequest({host:info.host,port:info.port,path,method,headers},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,text}));});req.on('error',reject);if(body)req.write(body);req.end();
});

test('guest gateway exposes only its fixed public files and route allowlist',async t=>{
  const {gateway,info}=await make();t.after(()=>gateway.close());
  assert.deepEqual([...GUEST_ROUTE_KEYS].sort(),['GET /match/view','GET /match/report','GET /table','POST /match/action','POST /match/feedback','POST /table/deck','POST /table/exit','POST /table/heartbeat','POST /table/join','POST /table/ready','POST /table/rematch'].sort());
  assert.equal((await request(info.origin,'/')).status,200);
  for(const path of ['/api/setup','/api/import-deck','/match.json','/game/.local/../manifest.json','/../package.json','/%2e%2e/%2e%2e/manifest.json'])assert.equal((await request(info.origin,path)).status,404,path);
});

test('join requires the exact origin and enforces body size before parsing',async t=>{
  const {gateway,info}=await make();t.after(()=>gateway.close());
  const good=await request(info.origin,'/table/join',{method:'POST',headers:{Origin:info.origin,'Content-Type':'application/json'},body:JSON.stringify({invite:'one'})});assert.equal(good.status,201);
  assert.equal((await request(info.origin,'/table/join',{method:'POST',headers:{Origin:'https://attacker.invalid','Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await rawRequest(info,'/table/join',{method:'POST',headers:{Host:`${info.host}:${info.port}`,Origin:info.origin,'Content-Type':'application/json','Content-Length':'65537'},body:'{}'})).status,413);
});

test('secured routes resolve membership from the bearer capability',async t=>{
  const {gateway,info}=await make();t.after(()=>gateway.close());
  assert.equal((await request(info.origin,'/match/view')).status,401);
  const view=await request(info.origin,'/match/view',{headers:{Authorization:'Bearer seat-secret'}});assert.equal(view.status,200);assert.equal((await view.json()).viewerSeatId,2);
  const action=await request(info.origin,'/match/action',{method:'POST',headers:{Origin:info.origin,Authorization:'Bearer seat-secret','Content-Type':'application/json'},body:JSON.stringify({targetId:1,seatId:0})});
  assert.equal(action.status,200);assert.equal((await action.json()).who.seatId,2);
  assert.equal((await request(info.origin,'/match/action',{method:'POST',headers:{Origin:info.origin,Authorization:'Bearer seat-secret','Content-Type':'application/json'},body:'x'.repeat(65537)})).status,413);
});

test('wrong Host, spoofed Origin and revoked sessions fail without reaching a private view',async t=>{
  const {gateway,info}=await make();t.after(()=>gateway.close());
  assert.equal((await rawRequest(info,'/match/view',{headers:{Host:'attacker.invalid',Authorization:'Bearer seat-secret'}})).status,403);
  assert.equal((await request(info.origin,'/table/ready',{method:'POST',headers:{Origin:'https://attacker.invalid',Authorization:'Bearer seat-secret','Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await request(info.origin,'/match/view',{headers:{Authorization:'Bearer revoked'}})).status,401);
});

/* THE WEB LOBBY TALKING TO THE GATEWAY (docs/plan-web-to-local-table-2026-09-21.md, piece 1).
 *
 * Rob wants the lobby at minorrob.github.io to send a table, and guests to pick decks there. That
 * page cannot reach 127.0.0.1 -- Chrome refuses the loopback by permission, and the host itself
 * answers 403 to any cross-origin request, which is a posture worth keeping. The way through is
 * this gateway, which cloudflared already publishes at a public https address.
 *
 * Measured before building: an OPTIONS preflight from that origin returned 404, because the
 * gateway has no CORS at all -- POSTs must carry its OWN origin, and its CSP says connect-src
 * 'self'. So the gateway needs to name one extra origin it will talk to, and only that one.
 *
 * Everything else stays: secured routes still need the bearer, rate limits are untouched, and an
 * origin that is neither the gateway's nor the configured web lobby is still refused.
 */
test('a configured web lobby may talk to the gateway, and nobody else may',async t=>{
  const web='https://minorrob.github.io';
  const {gateway,info}=await make({webOrigin:web});t.after(()=>gateway.close());

  const pre=await request(info.origin,'/table/join',{method:'OPTIONS',headers:{Origin:web,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization'}});
  assert.equal(pre.status,204,'a preflight from the web lobby is answered, not 404');
  assert.equal(pre.headers.get('access-control-allow-origin'),web);
  assert.match(pre.headers.get('access-control-allow-headers')||'',/authorization/i);

  const join=await request(info.origin,'/table/join',{method:'POST',headers:{Origin:web,'Content-Type':'application/json'},body:JSON.stringify({invite:'one'})});
  assert.equal(join.status,201,'and the POST itself is accepted from that origin');
  assert.equal(join.headers.get('access-control-allow-origin'),web,'with the header the browser needs to hand the body over');

  const other=await request(info.origin,'/table/join',{method:'OPTIONS',headers:{Origin:'https://attacker.invalid','Access-Control-Request-Method':'POST'}});
  assert.equal(other.headers.get('access-control-allow-origin'),null,'one origin, not any origin');
  assert.equal((await request(info.origin,'/table/join',{method:'POST',headers:{Origin:'https://attacker.invalid','Content-Type':'application/json'},body:'{}'})).status,403);
});

test('the gateway says it is alive without a token, so an address can be tested',async t=>{
  /* A trycloudflare address is new every session, so the web lobby is given one and has to be
     able to find out whether it still answers. Public on purpose, and it reveals nothing: no
     token, no deck, no table. */
  const {gateway,info}=await make({webOrigin:'https://minorrob.github.io'});t.after(()=>gateway.close());
  const res=await request(info.origin,'/health');
  assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.product,'CrankMagic Online');
  assert.equal(body.gateway,true);
  assert.ok(!('token' in body)&&!('decks' in body),'a probe is not a disclosure');
});

test('a gateway with no web lobby configured behaves exactly as before',async t=>{
  const {gateway,info}=await make();t.after(()=>gateway.close());
  const pre=await request(info.origin,'/table/join',{method:'OPTIONS',headers:{Origin:'https://minorrob.github.io','Access-Control-Request-Method':'POST'}});
  assert.equal(pre.headers.get('access-control-allow-origin'),null,'opening this up is opt-in, never the default');
});
