/** Temporary loopback-only credential entry for the bounded live provider proof. No key persistence. */
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {runEngineProof} from './phase-a-engine-proof.mjs';
import {createOpenAIChoiceProvider,createAnthropicChoiceProvider} from './api-choice-provider.mjs';
const port=8771,origin=`http://127.0.0.1:${port}`,token=randomUUID();
let status='Ready for your API key. No API requests have been made.',running=false;
const page=`<!doctype html><meta charset="utf-8"><title>CrankMagic Phase A API proof</title><style>body{font:18px system-ui;background:#111b28;color:#d8eaff;max-width:760px;margin:60px auto;padding:24px}input,select,button{font:inherit;padding:12px;margin:8px 0;width:100%;box-sizing:border-box}button{background:#6ecbff;border:0;border-radius:8px}p{line-height:1.6}</style><h1>Live AI integration check</h1><p>This starts an isolated Forge test with synthetic decks. It sends one engine choice and that test seat’s permitted view to the provider you select: Anthropic Claude Haiku 4.5 or OpenAI GPT-5.6 Sol. At most three requests are allowed, each capped at 512 output tokens. Your provider account is billed for actual usage.</p><p>Your key stays in this local process’s memory. It is not saved in browser storage, files, Git, or game logs. It is released when the test finishes; stop this temporary host to end the process.</p><form><label>Provider <select name="provider"><option value="anthropic">Anthropic - Claude Haiku 4.5</option><option value="openai">OpenAI - GPT-5.6 Sol</option></select></label><label>API key <input type="password" autocomplete="off" required></label><button>Run live API proof</button></form><p role="status" id="status"></p><script>const form=document.querySelector('form'),out=document.querySelector('#status');form.onsubmit=async e=>{e.preventDefault();const field=form.querySelector('input'),key=field.value;field.value='';form.querySelector('button').disabled=true;try{const r=await fetch('/run',{method:'POST',headers:{'Content-Type':'application/json','X-Proof-Token':'${token}'},body:JSON.stringify({key,provider:form.elements.provider.value})});out.textContent=(await r.json()).status}catch{out.textContent='Local test host unavailable'}};setInterval(async()=>{try{out.textContent=(await(await fetch('/status')).json()).status}catch{}},1000)</script>`;
createServer(async(req,res)=>{
  if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);return res.end();}
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'");
  const reply=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
  if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(page);}
  if(req.method==='GET'&&req.url==='/status')return reply(200,{status});
  if(req.method!=='POST'||req.url!=='/run'||req.headers.origin!==origin||req.headers['x-proof-token']!==token)return reply(403,{status:'Invalid local proof session'});
  if(running)return reply(409,{status:'A proof is already running'});
  try{
    let body='';for await(const chunk of req){body+=chunk;if(body.length>8192)throw Error('Request too large');}
    const entry=JSON.parse(body);body='';if(!['anthropic','openai'].includes(entry.provider))throw Error('Unsupported provider');const label=entry.provider==='anthropic'?'Anthropic Claude Haiku 4.5':'OpenAI GPT-5.6 Sol';const provider=(entry.provider==='anthropic'?createAnthropicChoiceProvider:createOpenAIChoiceProvider)({apiKey:entry.key});entry.key='';
    running=true;status='Running isolated Forge and live '+label+' integration check...';reply(202,{status});
    runEngineProof({provider}).then(r=>{status=r.passed?'PASS: live '+label+' choice returned through the per-seat Forge bridge. Test engine closed.':'Proof did not pass';})
      .catch(e=>{status='Proof failed: '+e.message;}).finally(()=>{running=false;});
  }catch{reply(400,{status:'Enter a valid API key to begin'});}
}).listen(port,'127.0.0.1',()=>console.log('API proof entry: '+origin));
