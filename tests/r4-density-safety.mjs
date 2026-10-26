/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {requestPolicy,accessHeaders,privateOutput,summaryOf,anonymousLabel} from './uat/r4-live-density.mjs';
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const staging='https://staging.crankmagic.com',local='http://crankmagic.localhost:8790',creds={id:'fixture-id',secret:'fixture-secret'};
eq(requestPolicy(staging+'/api/tables/known','POST',staging),'local-capability','the read-only known-card probe is answered locally as unavailable');
eq(requestPolicy(staging+'/api/library','PUT',staging),'deny-write','account writes cannot leave the fixture');
eq(requestPolicy(staging+'/api/ai/coach','POST',staging),'deny-write','the Coach cannot call a provider');
eq(requestPolicy(staging+'/api/social/invite','POST',staging),'deny-write','invitations and mail cannot leave the fixture');
eq(requestPolicy(staging+'/api/me','GET',staging),'local-api','identity is answered locally, never as Rob');
eq(requestPolicy('https://api.scryfall.com/cards/named','GET',staging),'deny-external','external reads require a local card stub');
eq(requestPolicy(staging+'/index.html','GET',staging),'asset','staging assets alone may be read');
eq(accessHeaders({},staging+'/index.html',staging,creds),{'cf-access-client-id':'fixture-id','cf-access-client-secret':'fixture-secret'},'credentials are attached to the exact staging origin');
for(const url of ['https://api.scryfall.com/x','https://staging.crankmagic.com.evil.test/x','https://crankmagic.com/x',local+'/index.html']){
  eq(accessHeaders({'CF-Access-Client-Secret':'old',accept:'text/html'},url,staging,creds),{accept:'text/html'},'credentials are stripped from every other origin');
}
eq(accessHeaders({},staging+'/index.html',local,creds),{},'a local run never attaches available staging credentials');
eq(accessHeaders({},staging+'/index.html',staging,{id:'fixture-id'}),{},'an incomplete credential pair is not sent');
assert.throws(()=>privateOutput(path.resolve('private-density-artifacts')),/outside every Git checkout/);checks++;
eq(privateOutput(path.join(os.tmpdir(),'crankmagic-density-safe-output')),path.join(os.tmpdir(),'crankmagic-density-safe-output'),'artifacts can be kept outside Git');
eq(summaryOf({decks:[{slots:[{quantity:4},{quantity:2}]},{archived:true,slots:[]}],groups:[{}],lots:[{},{}],cards:{one:{},two:{}}}),{decks:1,groups:1,lots:2,cards:2,deckCards:[6]},'only aggregate fixture density enters the report');
const original='A hypothetical lengthy fixture title',anonymous=anonymousLabel(original,'Deck',2);
eq(anonymous.split(' ').map(w=>w.length),original.split(' ').map(w=>w.length),'anonymized titles retain individual word lengths and wrapping density');
eq(anonymous.includes('hypothetical'),false,'anonymization carries no source title text');
console.log(`r4-density-safety: ${checks} checks passed`);
