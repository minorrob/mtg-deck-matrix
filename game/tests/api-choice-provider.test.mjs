import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAIChoiceProvider,createAnthropicChoiceProvider} from '../tools/api-choice-provider.mjs';
const ticket={seatId:2,revision:9,choice:{mode:'one',min:1,max:1,options:[{index:0,label:'First'},{index:1,label:'Second'}]},observation:{players:[]}};
const response=(text,status='completed')=>({ok:true,json:async()=>({status,output:[{type:'message',content:[{type:'output_text',text}]}]})});

test('Anthropic adapter constrains choices and keeps credentials out of request content',async()=>{
  let sent;const provider=createAnthropicChoiceProvider({apiKey:'test-only',maxCalls:1,fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(options.headers['x-api-key'],'test-only');
    assert.equal(options.headers['anthropic-version'],'2023-06-01');sent=JSON.parse(options.body);
    return {ok:true,json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:'{"index":1}'}]})};
  }});
  assert.equal(await provider(ticket),1);assert.equal(sent.max_tokens,64);
  assert.deepEqual(sent.output_config.format.schema.properties.index.enum,[0,1]);
  assert.ok(!JSON.stringify(sent).includes('test-only'));await assert.rejects(provider(ticket),/limit/);
});

test('Anthropic malformed, invented, truncated, refused and HTTP error responses fail closed',async()=>{
  for(const [text,stop_reason] of [['{"index":9}','end_turn'],['{"index":0,"extra":true}','end_turn'],['no JSON','end_turn'],['{"index":0}','max_tokens'],['{"index":0}','refusal']]){
    await assert.rejects(createAnthropicChoiceProvider({apiKey:'test',fetchImpl:async()=>({ok:true,json:async()=>({stop_reason,content:[{type:'text',text}]})})})(ticket));
  }
  await assert.rejects(createAnthropicChoiceProvider({apiKey:'secret',fetchImpl:async()=>({ok:false,status:401,json:async()=>({}),text:async()=>''})})(ticket),/AI provider request failed \(HTTP 401\)/);
});

test('Anthropic HTTP error includes response body in failure message',async()=>{
  const errorBody={error:{type:'invalid_request_error',message:'Invalid model specified'}};
  await assert.rejects(
    createAnthropicChoiceProvider({apiKey:'test',fetchImpl:async()=>({ok:false,status:400,json:async()=>errorBody,text:async()=>JSON.stringify(errorBody)})})(ticket),
    (err)=>err.message.includes('HTTP 400')&&err.message.includes('Invalid model specified')
  );
});
test('provider receives an offered choice and returns only a valid index with bounded calls',async()=>{
  let sent;const provider=createOpenAIChoiceProvider({apiKey:'test-only',maxCalls:1,fetchImpl:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');sent=JSON.parse(options.body);return response('{"index":1}');}});
  assert.equal(await provider(ticket),1);assert.equal(sent.store,false);assert.deepEqual(sent.text.format.schema.properties.index.enum,[0,1]);
  assert.equal(sent.model,'gpt-5-mini');
  assert.ok(!JSON.stringify(sent).includes('test-only'));await assert.rejects(provider(ticket),/limit/);
});
test('invalid, extra, incomplete, refused and provider-error answers cannot become engine actions',async()=>{
  for(const text of ['{"index":9}','{"index":0,"kind":"cast"}','{"index":"0"}','not JSON']){
    await assert.rejects(createOpenAIChoiceProvider({apiKey:'test',fetchImpl:async()=>response(text)})(ticket));
  }
  await assert.rejects(createOpenAIChoiceProvider({apiKey:'test',fetchImpl:async()=>response('{"index":0}','incomplete')})(ticket),/complete/);
  await assert.rejects(createOpenAIChoiceProvider({apiKey:'test',fetchImpl:async()=>({ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'No'}]}]})})})(ticket),/declined/);
  await assert.rejects(createOpenAIChoiceProvider({apiKey:'secret',fetchImpl:async()=>({ok:false,status:401,json:async()=>({}),text:async()=>''})})(ticket),/AI provider request failed \(HTTP 401\)/);
});

test('OpenAI HTTP error includes response body in failure message',async()=>{
  const errorBody={error:{message:'Invalid model: gpt-5.6-luna does not exist',type:'invalid_request_error',code:'model_not_found'}};
  await assert.rejects(
    createOpenAIChoiceProvider({apiKey:'test',fetchImpl:async()=>({ok:false,status:400,json:async()=>errorBody,text:async()=>JSON.stringify(errorBody)})})(ticket),
    (err)=>err.message.includes('HTTP 400')&&err.message.includes('model_not_found')
  );
});
