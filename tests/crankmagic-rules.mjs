/* The house rules, pinned: the cap floor, the 110%, the local-store line, the bands. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const R=createRequire(import.meta.url)('../crankmagic-rules.js');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
eq(R.RULES,{capFloor:2,capPct:.10,localOnly:5,perCardMax:30,deckCap:225,pool:100});
eq(R.capFor(0.4),0.4);eq(R.capFor(2),2);eq(R.capFor(2.01),2.21);eq(R.capFor(10),11);eq(R.capFor(null),null);eq(R.capFor('x'),null);
eq(R.localOnly(4.99),false);eq(R.localOnly(5),true);
eq(R.bandOf(0.99),'under1');eq(R.bandOf(1),'1to5');eq(R.bandOf(5),'1to5');eq(R.bandOf(5.01),'over5');eq(R.bandOf(null),'under1');
eq(R.warnings({price:10,paid:11}),[]);eq(R.warnings({price:10,paid:11.5}),['over the 110% cap']);
eq(R.warnings({price:31}),['over $30']);eq(R.warnings({price:6,vendor:'TCGplayer'}),['≥ $5 not local']);eq(R.warnings({price:6,vendor:'Game Theory Raleigh'}),[]);
console.log(`crankmagic-rules: ${checks} checks passed; the spending rules are one object.`);
