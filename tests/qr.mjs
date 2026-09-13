/* The QR encoder against segno. Every fixture in tests/fixtures/qr-fixtures.json is a symbol
   segno 1.6.6 drew for the same text, level, boost setting and (where forced) mask; the app's
   own link is the first of them. Agreement is module for module, plus the chosen version,
   level and mask when the mask is left to the penalty rules. The Reed-Solomon divisors, the
   format words and the version words are checked against segno's tables too. */
import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const QR=require('../crankmagic-qr.js');
const fx=JSON.parse(fs.readFileSync(new URL('./fixtures/qr-fixtures.json',import.meta.url),'utf8'));
let checks=0;
for(const f of fx.fixtures){const tag=`${f.designator} mask ${f.mask} "${f.text.slice(0,32)}"`;
  const q=QR.encode(f.text,{ecl:f.error.toUpperCase(),boost:f.boost,mask:f.forcedMask});
  assert.equal(q.version,f.version,tag+' version');assert.equal(q.ecl,f.ecl,tag+' level');assert.equal(q.mask,f.mask,tag+' mask');assert.equal(q.size,f.size,tag+' size');
  assert.deepEqual(q.rows,f.rows,tag+' modules');checks+=5;}
for(const [degree,logs] of Object.entries(fx.genPoly)){assert.deepEqual(QR.generator(Number(degree)).map(c=>QR.LOG[c]),logs,'generator degree '+degree);checks++;}
for(const [key,index] of Object.entries(fx.formatIndex)){assert.equal(QR.formatBits(key[0],Number(key.slice(1))),fx.formatInfo[index],'format '+key);checks++;}
fx.versionInfo.forEach((word,i)=>{assert.equal(QR.versionBits(7+i),word,'version word '+(7+i));checks++;});
const link='https://minorrob.github.io/mtg-deck-matrix/',s=QR.svg(link);
assert.ok(s.startsWith('<svg ')&&s.includes('viewBox="0 0 41 41"')&&s.includes('fill="#ffffff"'),'svg carries a 4-module quiet zone on white');checks++;
assert.throws(()=>QR.encode('x'.repeat(700)),/too long/,'past version 10 it says so');checks++;
console.log(`qr: ${checks} checks passed; ${fx.fixtures.length} symbols identical to segno's, the app link among them (${fx.fixtures[0].designator}, mask ${fx.fixtures[0].mask}).`);
