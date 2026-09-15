import test from 'node:test';
import assert from 'node:assert/strict';
import {cardGridMetrics,arrangeCardGroups} from '../ui/card-layout.mjs';
test('compact battlefield supports six columns and three full rows at different board sizes',()=>{
  for(const matWidth of [600,1000,1500]){
    const width=matWidth*.64,height=matWidth*.29;
    const m=cardGridMetrics({width,height,matWidth,zoom:32});
    assert.equal(m.columns,6);assert.equal(m.rows,3);assert.equal(m.capacity,18);
    assert.ok(m.cardWidth*6+25<=width);
    assert.ok((m.cardWidth*680/488+16)*3+10<=height+.01);
    const large=cardGridMetrics({width,height,matWidth,zoom:100});
    assert.ok(large.columns<m.columns);assert.ok(large.cardWidth>m.cardWidth);
  }
});
test('space controls automatic stacking without losing identities or manual groups',()=>{
  const cards=Array.from({length:18},(_,cardId)=>({cardId}));
  const groups=[{label:'Creatures',cards:cards.slice(0,10)},{label:'Artifacts',cards:cards.slice(10)}];
  const compact=arrangeCardGroups(groups,18);assert.equal(compact.length,18);assert.ok(compact.every(g=>!g.stacked));
  const crowded=arrangeCardGroups(groups,3);assert.deepEqual(crowded.flatMap(g=>g.cards),cards);assert.ok(crowded.some(g=>g.stacked));
  assert.equal(arrangeCardGroups([{manual:true,cards}],18).length,1);
  assert.equal(arrangeCardGroups([{manual:true,cards},{cards:[{cardId:20},{cardId:21}]}],3).length,3);
});
