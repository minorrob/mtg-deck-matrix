import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_OPENAI_MODEL,OPENAI_FALLBACK_MODEL,OPENAI_MODELS,readWindowsGenericCredential,loadOpenAiCredential} from '../tools/windows-credential.mjs';

test('Windows credential reader passes only a validated target and keeps the secret in memory',()=>{
  let call;const secret='test-key-that-is-long-enough';
  const value=readWindowsGenericCredential('crankmagic_openai_api',{platform:'win32',run:(file,args,options)=>{call={file,args,options};return secret;}});
  assert.equal(value,secret);assert.equal(call.file,'powershell.exe');assert.ok(call.args.includes('crankmagic_openai_api'));
  assert.deepEqual(call.options.stdio,['ignore','pipe','pipe']);assert.ok(!JSON.stringify(call).includes(secret));
  assert.equal(readWindowsGenericCredential('bad target',{platform:'win32',run:()=>{throw Error('must not run');}}),null);
  assert.equal(readWindowsGenericCredential('crankmagic_openai_api',{platform:'linux',run:()=>{throw Error('must not run');}}),null);
});

test('stored OpenAI configuration defaults to Luna with Terra as the only promoted fallback',()=>{
  const session=loadOpenAiCredential('crankmagic_openai_api',{platform:'win32',run:()=>'test-key-that-is-long-enough'});
  assert.equal(session.provider,'openai');assert.equal(session.model,'gpt-5.6-luna');assert.equal(session.source,'windows-credential-manager');
  assert.equal(DEFAULT_OPENAI_MODEL,'gpt-5.6-luna');assert.equal(OPENAI_FALLBACK_MODEL,'gpt-5.6-terra');assert.deepEqual(OPENAI_MODELS,['gpt-5.6-luna','gpt-5.6-terra']);
  assert.equal(loadOpenAiCredential('',{platform:'win32',run:()=>Buffer.from('unused')}),null);
});
