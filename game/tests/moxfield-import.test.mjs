import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMoxfieldTwoColumn} from '../contracts/moxfield-import.mjs';

test('two-column name/count CSV uses the blank line as the commander boundary',()=>{
  const value=parseMoxfieldTwoColumn('Card Name,Count\nForest,97\n"Temple, Garden",2\n\n"Chulane, Teller of Tales",1',{name:'Friends deck'});
  assert.equal(value.name,'Friends deck');assert.deepEqual(value.commanders,['Chulane, Teller of Tales']);assert.deepEqual(value.rows[1],{name:'Temple, Garden',quantity:2});
});
test('count/name order, CRLF and partners are supported',()=>{
  const value=parseMoxfieldTwoColumn('Quantity,Name\r\n98,Forest\r\n\r\n1,Partner One\r\n1,Partner Two\r\n');assert.equal(value.rows[0].quantity,98);assert.equal(value.commanders.length,2);
});
test('missing boundary, malformed rows, duplicate commander and wrong totals are rejected',()=>{
  assert.throws(()=>parseMoxfieldTwoColumn('Card Name,Count\nForest,99\nCommander,1'),/blank line/);
  assert.throws(()=>parseMoxfieldTwoColumn('Card Name,Count\nForest,99\n\nCommander,2'),/single-card/);
  assert.throws(()=>parseMoxfieldTwoColumn('Card Name,Count\nCommander,99\n\nCommander,1'),/appears twice/);
  assert.throws(()=>parseMoxfieldTwoColumn('Card Name,Count\nForest,98\n\nCommander,1'),/exactly 100/);
  assert.throws(()=>parseMoxfieldTwoColumn('Card Name,Count\n"Forest,99\n\nCommander,1'),/Unclosed quote/);
});
