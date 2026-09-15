import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAIChoiceProvider} from '../tools/api-choice-provider.mjs';
const ticket={seatId:2,revision:9,choice:{mode:'one',min:1,max:1,options:[{index:0,label:'First'},{index:1,label:'Second'}]},observation:{players:[]}};
const response=(text,status='completed')=>({ok:true,json:async()=>({status,output:[{type:'message',content:[{type:'output_text',text}]}]})});
test('provider receives an offered choice and returns only a valid index with bounded calls',async()=>{
  let sent;const provider=createOpenAIChoiceProvider({apiKey:'test-only',maxCalls:1,fetchImpl:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');sent=JSON.parse(options.body);return response('{"index":1}');}});
  assert.equal(await provider(ticket),1);assert.equal(sent.store,false);assert.deepEqual(sent.text.format.schema.properties.index.enum,[0,1]);
  assert.ok(!JSON.stringify(sent).includes('test-only'));await assert.rejects(provider(ticket),/limit/);
});
test('invalid, extra, incomplete, refused and provider-error answers cannot become engine actions',async()=>{
  for(const text of ['{"index":9}','{"index":0,"kind":"cast"}','{"index":"0"}','not JSON']){
    await assert.rejects(createOpenAIChoiceProvider({apiKey:'test',fetchImpl:async()=>response(text)})(ticket));
  }
  await assert.rejects(createOpenAIChoiceProvider({apiKey:'test',fetchImpl:async()=>response('{"index":0}','incomplete')})(ticket),/complete/);
  await assert.rejects(createOpenAIChoiceProvider({apiKey:'test',fetchImpl:async()=>({ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'No'}]}]})})})(ticket),/declined/);
  await assert.rejects(createOpenAIChoiceProvider({apiKey:'secret',fetchImpl:async()=>({ok:false,status:401})})(ticket),/^Error: AI provider request failed \(HTTP 401\)$/);
});
