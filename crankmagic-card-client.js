/* Preserve full printed facts for the library without changing the shared
 * legacy client or its simulator consumers. Its existing queue, cache TTL and
 * retry rules remain responsible for every request. No extra lookup per card. */
(function(root,factory){const legacy=typeof module==='object'&&module.exports?require('./scryfall-client.js'):root.MtgScryfall;const api=factory(legacy);if(typeof module==='object'&&module.exports)module.exports=api;root.CrankCardClient=api;})(globalThis,function(Legacy){
  function create(options={}){
    const memory=new Map(),facts=new Map(),prefix='crankmagic-scryfall:';
    let storage=options.storage;try{if(storage===undefined)storage=globalThis.sessionStorage;}catch{}
    function capture(raw){if(!raw||typeof raw!=='object')return;if(raw.object==='card'&&raw.id)facts.set(raw.id,raw);if(raw.data)for(const c of raw.data)capture(c);}
    const cache={get(key){let value=memory.get(key);try{value=storage?.getItem(prefix+key)||value;}catch{}if(value)try{capture(JSON.parse(value).payload);}catch{}return value||null;},set(key,value){memory.set(key,value);try{capture(JSON.parse(value).payload);storage?.setItem(prefix+key,value);}catch{}}};
    const client=Legacy.createClient({...options,cache});
    function enrich(c){if(!c)return c;const raw=facts.get(c.scryfallId);if(!raw)return c;const front=raw.card_faces?.[0]||raw;return {...c,power:front.power??null,toughness:front.toughness??null,collectorNumber:raw.collector_number||'',scryfallUri:raw.scryfall_uri||'',card_faces:raw.card_faces||[],priceUpdated:new Date().toISOString()};}
    return {...client,async named(...args){return enrich(await client.named(...args));},async bySetNumber(...args){return enrich(await client.bySetNumber(...args));},async byTcgplayerId(...args){return enrich(await client.byTcgplayerId(...args));}};
  }
  return {create};
});
