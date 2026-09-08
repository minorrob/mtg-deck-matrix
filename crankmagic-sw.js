/* The simulator is deliberately NOT precached. sim-engine.js and its worker are ~120 KB
 * that most sessions never run, and install does addAll -- so precaching them would make
 * every first visit pay for a feature it may not use. They are not in FILES, so the fetch
 * handler passes them straight to the network: available online, absent offline, which is
 * the honest trade for a background measurement nobody can run offline anyway.
 *
 * Cache only public application resources. IndexedDB transactions remain the
 * authority for user records; backups are user files, never service-worker data.
 * A failed installation leaves the prior complete cache available. */
const PREFIX='crankmagic-public:'+new URL('./',self.location).pathname+':';
const CACHE=PREFIX+(new URL(self.location).searchParams.get('v')||'1');
const FILES=['index.html','crankmagic.html','graph.html','crankmagic-route.js?v=1','crankmagic-design.css?v=1','crankmagic.css?v=24',
 'lineup-model.js?v=5','scryfall-client.js?v=8','card-link.js?v=1','deck-import.js?v=2','deck-sources.js?v=1','docx-writer.js?v=1','xlsx-writer.js?v=2','xlsx-reader.js?v=2','user-state.js?v=5',
 'crankmagic-assets.js?v=10','crankmagic-card-client.js?v=1','collection-model.js?v=6','collection-repository.js?v=2','collection-exchange.js?v=1','card-classify.js?v=3','card-catalog.js?v=7','draft-builder.js?v=5','crankmagic-glossary.js?v=1','guide-measured.js?v=1','crankmagic-graph.js?v=7','crankmagic-decks.js?v=8','crankmagic-collection.js?v=6','crankmagic-exchange-ui.js?v=3','crankmagic-sim.js?v=12','crankmagic-lab.js?v=16','crankmagic-facets.js?v=4','crankmagic-discover.js?v=21','custom-model.js?v=3','crankmagic-advisor.js?v=1','collection-evidence.js?v=1','crankmagic-evidence.js?v=2','crankmagic-plan-editor.js?v=1','crankmagic-app.js?v=41','crankmagic-brand.js?v=2',
 'assets/mana/W.svg?v=1','assets/mana/U.svg?v=1','assets/mana/B.svg?v=1','assets/mana/R.svg?v=1','assets/mana/G.svg?v=1','assets/mana/2.svg?v=1','assets/mana/3.svg?v=1','assets/crankmagic/crankmagic-logo-wand-v3-256.webp?v=1','assets/crankmagic/satoshi-400.woff2?v=1','assets/crankmagic/satoshi-500.woff2?v=1','assets/crankmagic/satoshi-700.woff2?v=1',
 'assets/crankmagic/commander-atraxa.webp?v=1','assets/crankmagic/commander-krenko.webp?v=1','assets/crankmagic/commander-shadrix.webp?v=1','assets/crankmagic/commander-chulane.webp?v=1',
 'data/commander-ranks.json?v=1','data/commander-glossary.json?v=1','data/commander-universe.json?v=1','data/flavor-names.json?v=1','data/cards.json?v=3','data/card-facts.json?v=2','data/graph.json?v=5','data/deck-guides.json?v=3','data/deck-swaps.json?v=2'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin)return;
 const relative=u.href.slice(new URL('./',self.location).href.length);
 if(event.request.mode==='navigate'&&['index.html','crankmagic.html','graph.html','crankmagic-route.js?v=1','index.html','graph.html'].includes(u.pathname.split('/').pop())){event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(c=>c.match(u.pathname.endsWith('graph.html')?'graph.html':'index.html'))));return;}
 if(!FILES.includes(relative))return;event.respondWith(caches.open(CACHE).then(async c=>(await c.match(event.request))||fetch(event.request).then(response=>{if(response.ok)event.waitUntil(c.put(event.request,response.clone()));return response;})));
});
