/* Cache only public application resources. IndexedDB transactions remain the
 * authority for user records; backups are user files, never service-worker data.
 * A failed installation leaves the prior complete cache available. */
const PREFIX='crankmagic-public:'+new URL('./',self.location).pathname+':';
const CACHE=PREFIX+'1';
const FILES=['crankmagic.html','crankmagic-design.css?v=1','crankmagic.css?v=1',
 'lineup-model.js?v=5','scryfall-client.js?v=7','card-link.js?v=1','deck-import.js?v=2','deck-sources.js?v=1','docx-writer.js?v=1','xlsx-writer.js?v=2','xlsx-reader.js?v=2','user-state.js?v=5','guide-agent.js?v=1',
 'crankmagic-assets.js?v=1','collection-model.js?v=1','collection-repository.js?v=1','collection-exchange.js?v=1','card-catalog.js?v=1','draft-builder.js?v=1','crankmagic-glossary.js?v=1','crankmagic-graph.js?v=1','crankmagic-decks.js?v=1','crankmagic-collection.js?v=1','crankmagic-exchange-ui.js?v=1','crankmagic-lab.js?v=1','crankmagic-discover.js?v=1','crankmagic-plan-editor.js?v=1','crankmagic-app.js?v=1','crankmagic-brand.js?v=1',
 'assets/mana/W.svg?v=1','assets/mana/U.svg?v=1','assets/mana/B.svg?v=1','assets/mana/R.svg?v=1','assets/mana/G.svg?v=1','assets/mana/2.svg?v=1','assets/mana/3.svg?v=1','assets/crankmagic/crankmagic-logo-wand-v3-256.webp?v=1','assets/crankmagic/satoshi-400.woff2?v=1','assets/crankmagic/satoshi-500.woff2?v=1','assets/crankmagic/satoshi-700.woff2?v=1',
 'assets/crankmagic/commander-atraxa.webp?v=1','assets/crankmagic/commander-krenko.webp?v=1','assets/crankmagic/commander-shadrix.webp?v=1','assets/crankmagic/commander-chulane.webp?v=1',
 'data/commander-glossary.json?v=1','data/commander-universe.json?v=1','data/cards.json?v=2','data/card-facts.json?v=2','data/graph.json?v=2','data/master-v2.json?v=2','data/deck-guides.json?v=1','data/deck-swaps.json?v=1'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin)return;
 const relative=u.href.slice(new URL('./',self.location).href.length);
 if(event.request.mode==='navigate'&&['crankmagic.html','index.html','graph.html'].includes(u.pathname.split('/').pop())){event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(c=>c.match('crankmagic.html'))));return;}
 if(!FILES.includes(relative))return;event.respondWith(caches.open(CACHE).then(async c=>(await c.match(event.request))||fetch(event.request).then(response=>{if(response.ok)event.waitUntil(c.put(event.request,response.clone()));return response;})));
});
