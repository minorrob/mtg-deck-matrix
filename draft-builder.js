/* This is a constructive starting-list tool, not the simulator. It balances
 * basic roles using card metadata, reports unfilled constraints and never
 * calls a model or claims measured strength. Simulation refinement is on hold. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CrankDraft=api;})(globalThis,function(){
  'use strict';
  const role=c=>{const t=c.typeLine||'',roles=c.roles||[];if(/Land/.test(t))return 'land';if(roles.includes('ramp'))return 'ramp';if(roles.includes('draw'))return 'draw';if(roles.some(r=>['removal','wipe','protection'].includes(r)))return 'interaction';return 'engine';};
  function build({commanders,cards,definition,available={},benchOnly=false,pinned=[]}){
    const colors=new Set(commanders.flatMap(c=>c.colorIdentity||[])),issues=[],chosen=new Map(),all=new Map(cards.map(c=>[c.id,c]));let spend=0;
    const legal=c=>c.verified&&c.legalities?.commander==='legal'&&(c.colorIdentity||[]).every(x=>colors.has(x));
    const price=c=>c.price===null||!Number.isFinite(c.price)?null:c.price;
    function add(c,n=1,required=false){if(!legal(c)){if(required)issues.push(c.name+': legality or color identity is not verified.');return false;}const have=chosen.get(c.id)||0,basic=/\bBasic\b/.test(c.typeLine||'');if(have&&!basic)return false;if(benchOnly&&(available[c.id]||0)<have+n){if(required)issues.push(c.name+': insufficient eligible copies in your selected pool.');return false;}const p=price(c);if(definition.perCardCap!==null&&(p===null||p>definition.perCardCap)||definition.budget!==null&&(p===null||spend+p*n>definition.budget)){if(required)issues.push(c.name+': price is unknown or exceeds a hard price limit.');return false;}chosen.set(c.id,have+n);spend+=(p||0)*n;return true;}
    for(const c of commanders){
      if(!legal(c)){issues.push(c.name+': legality or color identity is not verified.');continue;}
      chosen.set(c.id,1);spend+=(price(c)||0);
    }pinned.forEach(r=>{const c=all.get(r.cardId);if(c)add(c,r.quantity,true);else issues.push('A pinned card is missing from the catalog.');});
    const text=c=>[c.oracleText,...(c.mechanics||[]),...(c.roles||[])].join(' ').toLowerCase();
    const desired=(definition.mechanics||[]).map(x=>x.toLowerCase());const score=c=>desired.filter(x=>text(c).includes(x)).length*100+(available[c.id]?30:0)+(c.rank?20/(1+Math.log10(c.rank)):0)-Number(c.manaValue||0);
    const pool=cards.filter(c=>legal(c)&&!commanders.some(x=>x.id===c.id)).sort((a,b)=>score(b)-score(a)||a.name.localeCompare(b.name));
    const count=()=>[...chosen.values()].reduce((a,b)=>a+b,0),roleCount=r=>[...chosen].reduce((n,[id,q])=>n+(role(all.get(id)||commanders.find(c=>c.id===id))===r?q:0),0);
    for(const [r,target] of [['land',36],['ramp',10],['draw',10],['interaction',10],['engine',100]]){const candidates=pool.filter(c=>r==='engine'?role(c)!=='land':role(c)===r);for(const c of candidates){if(count()>=100||r!=='engine'&&roleCount(r)>=target)break;add(c);}if(r==='land'&&roleCount(r)<target){const names=colors.size?[...colors].map(x=>({W:'Plains',U:'Island',B:'Swamp',R:'Mountain',G:'Forest'})[x]):['Wastes'];const basics=names.map(n=>cards.find(c=>c.name===n)).filter(Boolean);let failed=0,i=0;while(basics.length&&roleCount(r)<target&&count()<100&&failed<basics.length){if(add(basics[i++%basics.length]))failed=0;else failed++;}}}
    if(count()!==100){
      const why=[];
      if(benchOnly&&!Object.keys(available).length)why.push('the pool is limited to your owned copies and your library holds none — switch the pool to "All legal catalog cards" or import your collection first');
      else if(benchOnly)why.push('the pool is limited to your owned copies');
      if(definition.budget!==null)why.push(`the total price cap is $${definition.budget}`);
      if(definition.perCardCap!==null)why.push(`the per-card cap is $${definition.perCardCap}`);
      issues.push(`Only ${count()} of 100 cards could be chosen`+(why.length?' because '+why.join(' and '):' within the catalog')+'. No limit was relaxed.');
    }
    const result=[...chosen].map(([cardId,quantity])=>({cardId,quantity,purpose:'main',pinned:pinned.some(r=>r.cardId===cardId)}));
    return {slots:result,cards:[...new Set([...chosen.keys()])].map(id=>all.get(id)||commanders.find(c=>c.id===id)),issues,estimatedPrice:spend,unknownPrices:result.filter(r=>price(all.get(r.cardId)||commanders.find(c=>c.id===r.cardId))===null).length,method:'Constructive metadata draft; not simulated',notes:['36 lands, 10 ramp, 10 draw and 10 interaction are starting targets, with overlapping abilities counted once.','Bracket, saltiness, speed and competitiveness require review. This initial pass does not certify them.']};
  }
  return {build,role};
});
