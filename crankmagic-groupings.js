/* ONE GROUPINGS MODULE. The sheet's "Group rows by", the Cards list's bands and the Tabletop's
 * pile dropdown group the same rows by the same keys, and they used to spell the choices, the
 * colour names and the ordering rules separately. They are here once: the choices a reader
 * can pick, the label a row wears under each, and the order the bands stand in. The row's
 * column values come from the caller (the Cards module's value(row, key)), so this module owns
 * no knowledge of decks, vendors or prices -- only of grouping. The status order is the model's
 * vocabulary, passed in for the same reason. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.CrankGroupings=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const CHOICES=[['','No grouping'],['deck','Deck'],['status','Status'],['vendor','Vendor'],['type','Type'],['color','Color'],['groups','Groups']];
  const COLOR_NAME={W:'White',U:'Blue',B:'Black',R:'Red',G:'Green'};
  /* The colour piles in the order a player sorts them: the five, then gold, then colourless. */
  const COLOR_PILE=['White','Blue','Black','Red','Green','Multiple','Colorless'];
  const colorLabel=identity=>{const ci=identity||[];return ci.length===0?'Colorless':ci.length>1?'Multiple':COLOR_NAME[ci[0]]||'Colorless';};
  /* label(row, key, value): the band a row belongs to under `key`; value(row, key) is the caller's
     column reader. Colour is the one key with its own words. */
  function label(r,key,value){return key==='color'?colorLabel(r.card&&r.card.colorIdentity):value(r,key);}
  /* order(row, key, value, statusOrder): a sort key for the band. "No value" -- a copy in no deck,
     no group -- is a to-do rather than a shelf, and goes last however the rest are ordered. */
  function order(r,key,value,statusOrder){
    const l=label(r,key,value);
    if(key==='status'){const at=typeof statusOrder==='function'?statusOrder(l):-1;return String(at<0?99:at).padStart(2,'0');}
    if(key!=='color')return String(l??'')||'￿';
    const at=COLOR_PILE.indexOf(l);return String(at<0?COLOR_PILE.length:at).padStart(2,'0');
  }
  return {CHOICES,COLOR_NAME,COLOR_PILE,colorLabel,label,order};
});
