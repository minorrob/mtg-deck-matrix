/* Imported evidence is not a fresh run. Deltas require the same declared
 * protocol, versions and conditions; a numeric difference alone proves no gain.
 * This module neither executes nor alters the held simulator. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CrankEvidence=api;})(globalThis,function(){
  const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
  const stable=x=>!object(x)&&!Array.isArray(x)?JSON.stringify(x):Array.isArray(x)?'['+x.map(stable).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';
  function validate(pack){
    if(!object(pack)||!['report','advice'].includes(pack.kind)||typeof pack.deckFingerprint!=='string'||!pack.deckFingerprint)throw Error('Evidence needs a kind and the exact deckFingerprint.');
    if(pack.kind==='advice'){if(typeof pack.text!=='string'||!pack.text.trim()||pack.text.length>100000)throw Error('Advice needs text of at most 100,000 characters.');return pack;}
    if(typeof pack.protocol!=='string'||!pack.protocol.trim()||!object(pack.versions)||!Object.keys(pack.versions).length||!object(pack.metrics)||!Object.keys(pack.metrics).length)throw Error('Reports need protocol, versions and nonempty metrics.');
    return pack;
  }
  function compare(a,b){
    validate(a);validate(b);
    const reasons=[];
    if(a.kind!=='report'||b.kind!=='report')throw Error('Choose two reports.');
    if(a.protocol!==b.protocol)reasons.push('Different protocols');
    if(stable(a.versions)!==stable(b.versions))reasons.push('Different engine, rules, card data or policy versions');
    if(!object(a.conditions)||!object(b.conditions)||!Object.keys(a.conditions).length||!Object.keys(b.conditions).length)reasons.push('Comparison conditions were not supplied');
    else if(stable(a.conditions)!==stable(b.conditions))reasons.push('Different declared opponents, seats, policies, seeds or run settings');
    const value=m=>typeof m==='number'?m:object(m)&&typeof m.value==='number'?m.value:null;
    const keys=[...new Set([...Object.keys(a.metrics),...Object.keys(b.metrics)])];
    return {compatible:!reasons.length,reasons,rows:keys.map(key=>{const left=value(a.metrics[key]),right=value(b.metrics[key]),unitA=a.metrics[key]?.unit||'',unitB=b.metrics[key]?.unit||'';return {key,left:a.metrics[key]??null,right:b.metrics[key]??null,delta:!reasons.length&&unitA===unitB&&Number.isFinite(left)&&Number.isFinite(right)?right-left:null};})};
  }
  return {validate,compare};
});
