// Cosmetic catalog shared by setup, the table and the local host. Source images stay intact.
export const PLAYMATS=Object.freeze([
  {id:'cube',name:'Runic cube',image:'/rob-playmat.png',layout:'classic'},
  {id:'moonlit-tree',name:'Moonlit tree',image:'/playmats/moonlit-tree.png',layout:'moon'},
  {id:'golden-lotus',name:'Golden lotus',image:'/playmats/golden-lotus.png',layout:'lotus'},
  {id:'sunlit-familiar',name:'Sunlit familiar',image:'/playmats/sunlit-familiar.png',layout:'gold'},
  {id:'shadow-forest',name:'Shadow forest',image:'/playmats/shadow-forest.png',layout:'gold'},
  {id:'mountain-horizon',name:'Mountain horizon',image:'/playmats/mountain-horizon.png',layout:'gold'},
  {id:'spirit-warrior',name:'Spirit warrior',image:'/playmats/spirit-warrior.png',layout:'classic',unmarked:true},
  {id:'violet-bloom',name:'Violet bloom',image:'/playmats/violet-bloom.png',layout:'violet'},
  {id:'plain',name:'Classic black',image:null,layout:'classic'}
]);
export const defaultPlaymat=seatId=>seatId===0?'cube':'random';
export const validPlaymat=id=>id==='random'||PLAYMATS.some(m=>m.id===id);
// Stable cosmetic randomness; never consumes the engine's shuffle/decision random stream.
export function resolvePlaymat(id,seed='table',seatId=0){
  if(!validPlaymat(id))id=defaultPlaymat(seatId);
  if(id!=='random')return PLAYMATS.find(m=>m.id===id);
  let hash=2166136261;for(const ch of `${seed}:${seatId}`){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619);}
  const illustrated=PLAYMATS.filter(m=>m.image);return illustrated[(hash>>>0)%illustrated.length];
}
export function readMatPreferences(){try{const value=JSON.parse(localStorage.getItem('crankmagic-playmats-v1'));return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}}
export function saveMatPreference(seatId,id){if(!validPlaymat(id))return;const saved=readMatPreferences();saved[seatId]=id;try{localStorage.setItem('crankmagic-playmats-v1',JSON.stringify(saved));}catch{}window.dispatchEvent(new CustomEvent('crankmagic-playmat',{detail:{seatId,id}}));}
export function paintMat(node,mat){
  node.dataset.mat=mat.id;node.dataset.layout=mat.layout;node.classList.toggle('illustrated-mat',!!mat.image);node.classList.toggle('unmarked-mat',!!mat.unmarked);
  node.style.setProperty('--playmat-image',mat.image?`url("${mat.image}")`:'none');
}
