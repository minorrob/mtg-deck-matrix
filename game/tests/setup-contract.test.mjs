import test from 'node:test';
import assert from 'node:assert/strict';
import {setupCatalog,validateSetup,assess,importWorkshopDeck} from '../tools/setup-catalog.mjs';
const catalog=setupCatalog();
test('the original fifty variants expose two hundred complete starting lists',()=>{
  assert.equal(catalog.variantCount,50);assert.equal(catalog.rungCount,200);
  assert.ok(catalog.decks.filter(d=>d.source==='preloaded').every(d=>d.total===100));
  assert.equal(catalog.defaults.seats.length,4);
});
test('counts and pilot choices are validated before accepting a game',()=>{
  validateSetup(catalog.defaults);
  for(const ais of [1,2,3])validateSetup({...catalog.defaults,ais,seats:catalog.defaults.seats.slice(0,ais+1)});
  for(const patch of [{humans:2},{ais:0},{ais:4},{maxCost:NaN},{maxCost:0},{bracket:0},{bracket:6},{seats:[]}])assert.throws(()=>validateSetup({...catalog.defaults,...patch}));
  const config=structuredClone(catalog.defaults);config.seats[1].nativeProfile='invented-profile';assert.throws(()=>validateSetup(config));
  const provider=structuredClone(catalog.defaults);provider.seats[1].aiProvider='invented-provider';assert.throws(()=>validateSetup(provider));
  const api=structuredClone(catalog.defaults);api.seats[1].aiProvider='openai';api.seats[1].aiModel='gpt-5-mini';assert.doesNotThrow(()=>validateSetup(api));
  api.seats[1].aiModel='gpt-5';assert.doesNotThrow(()=>validateSetup(api));
  api.seats[1].aiModel='claude-haiku-4-5-20251001';assert.throws(()=>validateSetup(api));
});
test('missing prices, missing identities, and over-budget decks cannot pass',()=>{
  const missing=assess({rows:[{name:'No such card',quantity:100}]},{bracket:3,maxCost:225});
  assert.equal(missing.ok,false);assert.ok(missing.problems.some(x=>x.includes('Missing prices')));assert.ok(missing.problems.some(x=>x.includes('identities')));
  const over=assess({rows:[{name:'Sol Ring',quantity:100}]},{bracket:3,maxCost:1});assert.equal(over.ok,false);assert.ok(over.problems.some(x=>x.includes('exceeds')));
});
test('Game Changer cap applies to the complete hundred, including commander entries',()=>{
  const deck={rows:[{name:'Sol Ring',quantity:4,gameChanger:true},{name:'Forest',quantity:96}]};
  assert.ok(assess(deck,{bracket:3,maxCost:10000}).problems.some(x=>x.includes('Game Changers')));
  assert.ok(!assess(deck,{bracket:4,maxCost:10000}).problems.some(x=>x.includes('Game Changers')));
});

test('workshop imports reject wrong totals and duplicated commanders before lookup',async()=>{
  const deck={schema:'CrankMagicDeckHandoff@1',name:'Import test',commanders:['Chulane, Teller of Tales'],rows:[{name:'Forest',quantity:98}]};
  await assert.rejects(importWorkshopDeck(deck),/exactly 100/);
  await assert.rejects(importWorkshopDeck({...deck,rows:[{name:'Forest',quantity:98},{name:'Chulane, Teller of Tales',quantity:1}]}),/appears twice/);
  await assert.rejects(importWorkshopDeck({...deck,rows:[{name:'Forest',quantity:99.5}]}),/exactly 100/);
});

/* The host's saved decks belong to the host. A guest could never reach them, which is right by
 * default and wrong when the host wants to lend somebody a deck for the evening -- so it is a
 * setting, refused when it is off and named when it is refused. */
test('a guest reaches the host library only when the host shares it',async()=>{
  const {prepareGuestDeck}=await import('../tools/setup-catalog.mjs');
  const rules={bracket:3,maxCost:225,humans:2,ais:1};
  await assert.rejects(()=>prepareGuestDeck({seatId:1},{source:'library',deckId:'deck:live:D2'},rules),
    /has not shared their saved decks/,'off by default, and it says so rather than listing the other options');
  await assert.rejects(()=>prepareGuestDeck({seatId:1},{source:'nonsense'},rules),
    /Choose a pasted, saved, preloaded/,'an unknown source still lists what is on offer');
  // With sharing on the request is accepted as a library request. What happens after that is
  // ordinary deck preparation, which needs the engine -- so the assertion is that whatever stops
  // it, it is no longer the permission check.
  const shared=await prepareGuestDeck({seatId:1},{source:'library',deckId:'deck:live:D2'},{...rules,shareLibrary:true})
    .then(()=>null,error=>error);
  assert.ok(!shared||!/has not shared/.test(shared.message),
    `sharing on must get past the permission check, but failed with: ${shared&&shared.message}`);
});
