import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceColors,manaStatus} from '../ui/mana-status.mjs';
test('mana display distinguishes actual sources from token creation text',()=>{
  assert.deepEqual(sourceColors({oracleText:'Whenever you attack, create a Treasure token with “{T}, Sacrifice this artifact: Add one mana of any color.”'}),[]);
  assert.deepEqual(sourceColors({oracleText:'{T}: Add {C}{C}.'}),['C']);
  assert.deepEqual(sourceColors({typeLine:'Basic Land — Forest'}),['G']);
  assert.deepEqual(sourceColors({oracleText:'{T}: Add one mana of any color in your commander’s color identity.'},['U','G']),['U','G']);
});
test('shared colored sources are counts, separate from floating mana',()=>{
  const p={playerId:0,zones:{Battlefield:{cards:[{oracleText:'{T}: Add {U} or {G}.',tapped:true},{oracleText:'{T}: Add {C}{C}.'}]}},mana:[{color:'C'},{color:'C'}]};
  const s=manaStatus(p,[p]);assert.equal(s.shared,1);assert.equal(s.counts.U.tapped,1);assert.equal(s.counts.G.tapped,1);assert.deepEqual(s.counts.C,{untapped:1,tapped:0,floating:2});
});
