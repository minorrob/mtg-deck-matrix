/* Native workerd regression, with all outbound network intercepted. No real credentials or mail.
   Set MINIFLARE_MODULE to the installed Miniflare ESM entry when it is outside this project.
   This explicitly fails if the runtime is unavailable; Node fetch is not an equivalent test. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const {Miniflare,convertV4MiniflareOptions}=await import(process.env.MINIFLARE_MODULE||'miniflare');
const root=new URL('../../',import.meta.url);
const app='00000000-0000-0000-0000-000000000000',policyId='11111111-1111-1111-1111-111111111111';
const initial=()=>({id:policyId,reusable:true,app_count:1,name:'Invited',decision:'allow',include:[{group:{id:'preserved'}}],exclude:[],require:[]});
let policy=initial(),scenario='success',requests=[];
const entry=`import {admitAddress} from '../../cloud/access-invites.mjs';
import {sendMail} from '../../cloud/mail.mjs';
export default {async fetch(request){
 let lease;
 const db={prepare(sql){return {bind(...args){return {async first(){if(sql.startsWith('INSERT')){lease={holder:args[1],expires_at:args[2]};return lease;}return lease;},async run(){lease=null;}};}};}};
 const env={ACCESS_INVITE_TOKEN:'test-only',RESEND_API_KEY:'test-only',ACCESS_INVITE_APP_IDS:'${app}',ACCESS_INVITE_POLICY_ID:'${policyId}',CLOUDFLARE_ACCOUNT_ID:'00000000000000000000000000000000'};
 try {
  await admitAddress(db,env,'invitee@example.com',{now:()=>new Date().toISOString(),fetchImpl:fetch,fail(message,status){throw Object.assign(new Error(message),{status});}});
  const result=await sendMail(env,{id:'runtime-test',recipient:'invitee@example.com',subject:'Runtime test',text:'Synthetic fixture'},fetch);
  return Response.json({result,lockReleased:!lease});
 } catch(e){return Response.json({error:e.message,lockReleased:!lease},{status:502});}
}};`;
const options={compatibilityDate:process.env.WORKER_RUNTIME_DATE||'2026-09-30',modules:[
 {type:'ESModule',path:fileURLToPath(new URL('tests/uat/sharing-runtime-worker.mjs',root)),contents:entry},
 ...['cloud/access-invites.mjs','cloud/mail.mjs'].map(p=>({type:'ESModule',path:fileURLToPath(new URL(p,root)),contents:readFileSync(new URL(p,root),'utf8')}))
],outboundService:async request=>{
 const url=new URL(request.url);requests.push({host:url.hostname,path:url.pathname,method:request.method});
 assert.equal(request.headers.get('authorization'),'Bearer test-only','synthetic credential retained only for intended host');
 if(scenario==='access-redirect'&&url.hostname==='api.cloudflare.com'||scenario==='mail-redirect'&&url.hostname==='api.resend.com')
   return new Response('Do not follow',{status:302,headers:{location:'https://unexpected.example/credential-trap'}});
 if(url.hostname==='api.cloudflare.com'){
  if(url.pathname.endsWith('/apps/'+app))return Response.json({success:true,result:{policies:[{id:policyId}]}});
  assert.ok(url.pathname.endsWith('/policies/'+policyId));
  if(request.method==='PUT')policy={...policy,...await request.json()};
  return Response.json({success:true,result:policy});
 }
 assert.equal(url.hostname,'api.resend.com','no redirect or unapproved destination contacted');
 return Response.json({id:'runtime-message'});
}};
const mf=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(options):options);
try{
 for(scenario of ['success','access-redirect','mail-redirect']){
  policy=initial();requests=[];
  const response=await mf.dispatchFetch('http://localhost/'+scenario),body=await response.json();
  assert.equal(response.status,scenario==='success'?200:502,scenario+' status');
  assert.equal(body.lockReleased,true,scenario+' releases admission lock');
  assert.ok(requests.length>0,'native fetch reaches intercepted network');
  assert.equal(requests.some(r=>r.host==='unexpected.example'),false,'redirect destination never reached');
  if(scenario==='success'){
   assert.equal(body.result.messageId,'runtime-message');
   assert.deepEqual(policy.include,[{group:{id:'preserved'}},{email:{email:'invitee@example.com'}}]);
   assert.equal(requests.filter(r=>r.host==='api.resend.com').length,1);
  }else if(scenario==='access-redirect')assert.equal(requests.some(r=>r.host==='api.resend.com'),false,'failed admission sends no mail');
  console.log('PASS native Workers '+scenario);
 }
}finally{await mf.dispose();}
