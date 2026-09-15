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
