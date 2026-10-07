/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Local workerd recovery rehearsal, never a deployment. The real production profiles run
 * against temporary D1/DO storage and ephemeral fixture Access keys. No external credentials. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {build,worktreeSource} from '../../tools/release-pages.mjs';
import {launchBrowser} from './browser-runner.mjs';
import {stubNetwork} from './scryfall-stub.mjs';
const require=createRequire(import.meta.url),playwright=require(process.env.UAT_PLAYWRIGHT||'playwright');
const WRANGLER=process.env.WRANGLER;
assert.ok(WRANGLER,'Set WRANGLER to pinned 4.139.0 bin/wrangler.js');
const PORT=Number(process.env.E2E_PORT||8807),WORKER=PORT+1,BASE=`http://crankmagic.localhost:${PORT}`;
const dir=mkdtempSync(path.join(os.tmpdir(),'crankmagic-production-recovery-')),state=path.join(dir,'state');
const TEAM='recovery.cloudflareaccess.com',AUD='recovery-audience',EMAIL='recovery@e2e.test';
const env={...process.env,CI:'1',WRANGLER_SEND_METRICS:'false',XDG_CONFIG_HOME:path.join(dir,'config'),WRANGLER_LOG_PATH:path.join(dir,'logs')};
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;console.log(`  ok  ${m}`);};let checks=0;
const source=worktreeSource(),configs={};
for(const profileName of ['cloud-production-standby','cloud-production']){
 const {built,problems}=build({source,profileName});eq(problems,[],`${profileName} builds`);
 const folder=profileName;
 for(const [f,body] of built){mkdirSync(path.dirname(path.join(dir,folder,f)),{recursive:true});writeFileSync(path.join(dir,folder,f),body);}
 const c=JSON.parse(built.get('wrangler.jsonc'));
 eq([c.vars.PLAYTEST_TABLES,c.vars.SERVICE_SEATS],[undefined,undefined],`${profileName} excludes staging privileges`);
 c.vars={...c.vars,ACCESS_TEAM_DOMAIN:TEAM,ACCESS_AUD:AUD};
 c.compatibility_date=[c.compatibility_date,createRequire(WRANGLER)('workerd').compatibilityDate].sort()[0];
 c.main=`${folder}/${c.main}`;c.assets={...c.assets,directory:`./${folder}`};
 c.d1_databases=c.d1_databases.map(d=>({...d,migrations_dir:`${folder}/${d.migrations_dir}`}));delete c.routes;configs[profileName]=c;
}
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwks=JSON.stringify({keys:[{...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'recovery'}]});
const b64=v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url');
async function token(service=false){const now=Math.floor(Date.now()/1000),h=b64({alg:'RS256',kid:'recovery'}),p=b64({aud:[AUD],iss:`https://${TEAM}`,iat:now,exp:now+3600,...(service?{common_name:'test-service'}:{email:EMAIL})});return `${h}.${p}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(`${h}.${p}`))).toString('base64url')}`;}
const configPath=path.join(dir,'wrangler.jsonc');
writeFileSync(configPath,JSON.stringify(configs['cloud-production-standby']));
const migration=spawnSync(process.execPath,[WRANGLER,'d1','migrations','apply','crankmagic','--local','--persist-to',state],{cwd:dir,env,encoding:'utf8'});
assert.equal(migration.status,0,`local migration: ${migration.stderr}`);
let server=null;
async function stop(){if(!server)return;const child=server;server=null;await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);child.kill();});}
async function start(name){await stop();writeFileSync(configPath,JSON.stringify(configs[name]));server=spawn(process.execPath,[WRANGLER,'dev','--local','--ip','127.0.0.1','--port',String(WORKER),'--persist-to',state,'--var',`ACCESS_JWKS:${jwks}`],{cwd:dir,env});let log='';await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`local runtime did not start: ${log.slice(-1200)}`)),90000);const watch=chunk=>{log+=chunk;if(/Ready on|ready on/.test(log)){clearTimeout(timer);resolve();}};server.stdout.on('data',watch);server.stderr.on('data',watch);server.once('exit',code=>{clearTimeout(timer);reject(Error(`local runtime exited ${code}: ${log.slice(-1200)}`));});});}
async function api(method,route,body,service=false){const r=await fetch(`http://127.0.0.1:${WORKER}${route}`,{method,redirect:'manual',headers:{'cf-access-jwt-assertion':await token(service),...(body?{'content-type':'application/json','x-crankmagic':route.startsWith('/api/library')?'sync':'play'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,json:await r.json().catch(()=>null)};}
const proxy=http.createServer(async(req,res)=>{const upstream=http.request({host:'127.0.0.1',port:WORKER,method:req.method,path:req.url,headers:{...req.headers,'cf-access-jwt-assertion':await token()}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);});
proxy.on('upgrade',async(req,socket,head)=>{const headers={...req.headers,'cf-access-jwt-assertion':await token()},up=net.connect(WORKER,'127.0.0.1',()=>{up.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')}\r\n\r\n`);if(head.length)up.write(head);up.pipe(socket);socket.pipe(up);});up.on('error',()=>socket.destroy());socket.on('error',()=>up.destroy());});
await new Promise(r=>proxy.listen(PORT,'127.0.0.1',r));
let browser;
const shots=process.env.UAT_SHOTS;if(shots)mkdirSync(shots,{recursive:true});
try{
 await start('cloud-production-standby');
 eq((await api('POST','/api/tables',{hostName:'Recovery',seats:[{kind:'ai'}]})).status,503,'standby closes table creation');
 eq((await api('GET','/api/me',null,true)).status,401,'production standby refuses service-token identity');
 const M=require('../../collection-model.js'),E=require('../../collection-exchange.js');
 const backup=await E.backup({state:M.empty(),history:[]});
 const upload={parent:null,revision:0,device:'Recovery fixture',checksum:backup.checksum,body:gzipSync(JSON.stringify(backup)).toString('base64')};
 const saved=await api('PUT','/api/library',upload);eq(saved.status,200,'a fixture library saves with Play closed');
 const version=`/api/library/versions/${saved.json.head.id}`;
 const original=(await api('GET',version)).json;
 await start('cloud-production');
 eq((await api('GET',version)).json,original,'enabling Play preserves exact library bytes and head');
 eq((await api('GET','/api/me',null,true)).status,401,'active production refuses service-token identity');
 const made=await api('POST','/api/tables',{hostName:'Recovery',seats:[{kind:'ai',name:'House'}]});
 eq([made.status,made.json.table.playtest],[201,false],'production creates a normal private-record table');
 const url=`/api/tables/${made.json.table.tableId}`;
 const deck={name:'Legal fixture',commander:['Krenko, Mob Boss'],cards:Array(99).fill('Mountain')};
 for(const seatId of [0,1])eq((await api('POST',`${url}/deck`,{seatId,deck})).status,200,`legal fixture seated at ${seatId}`);
 await api('POST',`${url}/ready`,{ready:true});eq((await api('POST',`${url}/start`,{})).status,200,'countdown starts');
 browser=await launchBrowser(playwright);const context=await browser.newContext({viewport:{width:1400,height:900},serviceWorkers:'block'}),page=await context.newPage();
 await stubNetwork(page,[]);const frames=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('websocket',ws=>ws.on('framereceived',f=>{try{const x=JSON.parse(f.payload);if(x.type==='view')frames.push(x.view);}catch{}}));
 await page.goto(`${BASE}/index.html#table?id=${made.json.table.tableId}`);await page.locator('#cm-board .cm-board-strip').waitFor({timeout:45000});
 await page.waitForFunction(()=>Boolean(document.querySelector('#cm-board-decision')),null,{timeout:15000});
 eq(frames.length>0,true,'production board receives real WebSocket views');
 const before=frames.at(-1);assert.ok(before.decision?.id,'pending decision exists before recovery');
 if(shots)await page.screenshot({path:path.join(shots,'production-before-recovery.png')});
 await page.goto('about:blank');await start('cloud-production-standby');
 for(const [method,route,body] of [['GET',url],['GET',`${url}/connect`],['POST','/api/tables',{}]])eq((await api(method,route,body)).status,503,`standby closes ${method} ${route}`);
 eq((await api('GET',version)).json,original,'recovery keeps exact library bytes and history');
 await page.goto(`${BASE}/index.html#game`);await page.getByText('Coming Soon',{exact:true}).first().waitFor({timeout:30000});
 eq(await page.locator('#cm-board').count(),0,'standby serves the closed Play page');
 if(shots)await page.screenshot({path:path.join(shots,'production-standby.png')});
 await start('cloud-production');
 const recovered=await api('GET',url);eq([recovered.status,recovered.json.table.phase],[200,'playing'],'same persisted table remains playing after reopening');
 frames.length=0;await page.goto(`${BASE}/index.html#table?id=${made.json.table.tableId}`);await page.locator('#cm-board .cm-board-strip').waitFor({timeout:30000});
 const end=Date.now()+15000;while(!frames.length&&Date.now()<end)await page.waitForTimeout(50);
 const after=frames.at(-1);eq([after?.revision,after?.decision?.id],[before.revision,before.decision.id],'pending game revision and question survive profile changes');
 eq(after.state.players.every((p,i)=>i===0||['Hand','Library'].every(z=>(p.zones[z]?.cards??[]).every(c=>!c.name))),true,'recovered socket still hides the other hand and library');
 if(shots)await page.screenshot({path:path.join(shots,'production-recovered.png')});
 eq((await api('POST',`${url}/end`,{})).status,200,'host can end the recovered fixture game');
 const record=(await api('GET',`${url}/record`)).json.record;
 eq([record.kind,record.playtest],['seat',false],'production download is only the player record');
 eq(['seed','pod','tape','journal'].filter(k=>k in record),[],'production record exposes no seed, pod, tape or private journal');
 eq((await api('GET',version)).json,original,'game/recovery work never rewrote the fixture library');
 eq(errors,[],'no page errors throughout recovery');
}finally{if(browser)await browser.close();proxy.close();await stop();}
console.log(`production-play-e2e: ${checks} checks passed; local workerd only, not a live Cloudflare rollback`);
