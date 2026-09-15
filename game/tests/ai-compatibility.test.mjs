import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectScript} from '../tools/ai-compatibility.mjs';
test('Commander-legal hints are not mislabeled as native AI exclusions',()=>{
  assert.equal(inspectScript('AI:RemoveDeck:NonCommander\n').nativeAiWarning,false);
  assert.equal(inspectScript('AI:RemoveDeck:Random\n').nativeAiWarning,false);
  assert.equal(inspectScript('AI:RemoveDeck:All\n').nativeAiWarning,true);
});
test('rules implementation is retained even when native AI authors flag a card',()=>{
  const c=inspectScript('A:AB$ Mana | Cost$ 1 T | Produced$ G U\nAI:RemoveDeck:All\n');
  assert.deepEqual(c.abilities,['Mana']);assert.equal(c.nativeAiWarning,true);
});
