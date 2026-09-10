/* One named URL per public input; none of these assets asserts user ownership.
 *
 * CLEAN START. The six reference decks and the fifty variants are not here. They were
 * archived to data/archive/ so a new library opens empty rather than pre-populated with
 * somebody else's decks -- an app whose first screen shows six decks you did not build
 * is not a workshop, it is a demo. guides and swaps still point at live files; those
 * files now hold no decks, so the features stay wired and simply find nothing until
 * there is something to find. */
(function(root){'use strict';const data={ranks:"data/commander-ranks.json?v=2",universe:"data/commander-universe.json?v=2",flavorNames:"data/flavor-names.json?v=2",cards:"data/cards.json?v=5",facts:"data/card-facts.json?v=2",graph:"data/graph.json?v=8",guides:"data/deck-guides.json?v=3",swaps:"data/deck-swaps.json?v=2",glossary:"data/commander-glossary.json?v=1",simConfig:"sim/config.json?v=1",simOpponents:"sim/opponents.json?v=2"};if(typeof module==='object'&&module.exports)module.exports=data;if(root)root.CrankAssets=data;})(typeof globalThis!=='undefined'?globalThis:this);
