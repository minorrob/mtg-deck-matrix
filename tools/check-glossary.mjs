/** One authoring authority prevents an outdated workbook or UI tooltip from
 * silently overriding corrected terminology. This validates the data contract,
 * not the entire Magic rules engine or the factual meaning of every sentence.
 * Run from any directory: node tools/check-glossary.mjs
 */
import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url);
const g=JSON.parse(readFileSync(new URL('data/commander-glossary.json',base),'utf8'));
assert.equal(g.schemaVersion,1);assert.match(g.revision,/^\d{4}-\d{2}-\d{2}\.\d+$/);
assert.ok(g.entries.length>272,'Workbook terms plus expanded terminology');
const ids=new Set(),aliases=new Map();
for(const e of g.entries){
 assert.match(e.id,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);assert.ok(!ids.has(e.id),'Duplicate ID: '+e.id);ids.add(e.id);
 for(const key of ['term','category','definition'])assert.ok(typeof e[key]==='string'&&e[key].trim(),'Missing '+key+' for '+e.id);
 assert.ok(!/[<>]/.test(e.definition),'Definitions are plain text: '+e.id);
 assert.ok(Array.isArray(e.aliases));assert.ok(e.references?.length,'Missing provenance: '+e.id);
 for(const r of e.references){const [source,rule]=r.split('#');assert.ok(g.references[source],'Unknown reference '+r);assert.equal(new URL(g.references[source].url).protocol,'https:');if(rule)assert.match(rule,/^\d{3}(\.\d+)?[a-z]?$/);}
 for(const alias of [e.term,...e.aliases]){assert.ok(alias.trim());const key=alias.normalize('NFKC').toLowerCase();assert.ok(!aliases.has(key)||aliases.get(key)===e.id,'Ambiguous alias '+alias);aliases.set(key,e.id);}
 assert.ok(!('sourceDefinition' in e)&&!('override' in e),'Competing definition: '+e.id);
}
for(const id of ['flying','lifelink','regenerate','banding','proliferate','color-identity','commander-tax','creature','instant','sorcery','mana','draw-a-card','counter','counters-general','tokens-general'])assert.ok(ids.has(id),'Missing foundational term '+id);
assert.equal(g.effectCategoryRatings.simulationEligible,false,'Subjective ratings must not become simulation coefficients');
for(const file of ['data/glossary-editorial.json','data/sources/commander-glossary-workbook.json'])assert.ok(!existsSync(new URL(file,base)),'Second definition source: '+file);
console.log(`Glossary valid: ${g.entries.length} terms, ${aliases.size} names/aliases, one canonical definition per ID.`);
