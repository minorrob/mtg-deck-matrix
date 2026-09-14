/* One named URL per public input; none of these assets asserts user ownership.
 *
 * CLEAN START. The six reference decks and the fifty variants are not here. They were
 * archived to data/archive/ so a new library opens empty rather than pre-populated with
 * somebody else's decks -- an app whose first screen shows six decks you did not build
 * is not a workshop, it is a demo. guides and swaps still point at live files; those
 * files now hold no decks, so the features stay wired and simply find nothing until
 * there is something to find. */
(function(root){'use strict';const data={ranks:"data/commander-ranks.json?v=3",universe:"data/commander-universe.json?v=3",flavorNames:"data/flavor-names.json?v=3",cards:"data/cards.json?v=6",facts:"data/card-facts.json?v=3",graph:"data/graph.json?v=16",graphPlayed:"data/graph-played.json?v=2",guides:"data/deck-guides.json?v=4",swaps:"data/deck-swaps.json?v=2",glossary:"data/commander-glossary.json?v=2",simConfig:"sim/config.json?v=2",simOpponents:"sim/opponents.json?v=3"};
/* THE SCHEMA EACH FILE MUST ANSWER WITH. Every data file opens with {schema, stamp, generator, count} (schema/index.mjs is the registry); a reader passes what it fetched through expect() so a file of the wrong shape fails with a sentence instead of a blank page later. */
const schemas={ranks:'commander-ranks@1',universe:'commander-universe@1',flavorNames:'flavor-names@1',cards:'cards@1',facts:'card-facts@1',graph:'graph@2',graphPlayed:'graph-played@2',guides:'deck-guides@1',glossary:'commander-glossary@1',simConfig:'sim-config@2',simOpponents:'sim-opponents@2'};
Object.defineProperty(data,'schemas',{value:schemas,enumerable:false});
Object.defineProperty(data,'expect',{enumerable:false,value:(json,key)=>{const want=schemas[key];if(!want)return json;const got=json&&json.schema;if(got!==want)throw Error(`${String(data[key]).split('?')[0]} is ${got?'schema '+got:'not a stamped data file'}; this build reads ${want}.`);return json;}});
if(typeof module==='object'&&module.exports)module.exports=data;if(root)root.CrankAssets=data;})(typeof globalThis!=='undefined'?globalThis:this);
