/* This is a constructive starting-list tool, not the simulator. It balances
 * basic roles using card metadata, reports unfilled constraints and never
 * calls a model or claims measured strength. Simulation refinement is on hold.
 *
 * MONEY, WHEN THERE IS A CAP. The first version spent a total cap greedily -- best-scored
 * card first, each one accepted while the running total still fitted -- and refused any
 * card without a recorded price, basic lands included. With a $100 cap on Krenko that
 * produced twelve cards: twelve staples that used the hundred dollars, then nothing
 * fitted, and the basics that would have finished the deck were turned away for having
 * no price. A budget Krenko exists; the builder was not looking for it.
 *
 * Now a cap is planned, not merely obeyed:
 *   - A basic land with no recorded price is priced at a dime. It is the one card the
 *     catalog can vouch for without a number.
 *   - THE UPGRADE PASS: once the hundred is full, what is left of the cap buys upgrades --
 *     the best-scored cards not yet in the list replace the weakest of the same role, one
 *     swap at a time, while the money lasts. A $100 list should cost about $100.
 *   - THE RESERVE RULE: a card is taken only if, after it, what remains of the cap can
 *     still finish the hundred with basics. The deck always completes.
 *   - THE FAIR-SHARE RULE: most cards must cost no more than a few times an even share of
 *     the cap (a dollar a card under $100). A bounded splurge -- half the cap -- may go to
 *     the best-scored cards above that line, so a budget list still carries its staples
 *     without twelve of them being the whole deck. If the roles cannot be filled under
 *     the share it is loosened in steps and the result says how far -- a relaxation of
 *     the share, never of the cap.
 *   - Under a cap, the candidate order also prefers value: the same score costs less.
 *   - Lands: a mono-colour deck wants basics, not fourteen utility lands with a rank.
 *     Nonbasic lands are capped by colour count and basics fill the rest.
 *   - Game Changers follow the bracket: none at a ceiling of 1-2, three at 3, any at 4-5.
 *
 * Play style, speed, competitiveness and saltiness do not steer this pass and the notes
 * say so; pretending a slider changed the list would be worse than admitting it did not. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CrankDraft=api;})(globalThis,function(){
  'use strict';
  const BASIC_PRICE=.10;
  const isBasic=c=>/\bBasic\b/.test(c.typeLine||'');
  const role=c=>{const t=c.typeLine||'',roles=c.roles||[];if(/Land/.test(t))return 'land';if(roles.includes('ramp'))return 'ramp';if(roles.includes('draw'))return 'draw';if(roles.some(r=>['removal','wipe','protection'].includes(r)))return 'interaction';return 'engine';};
  const TARGETS=[['land',36],['ramp',10],['draw',10],['interaction',10],['engine',100]];
  /* How far the fair share may stretch, pass by pass: three times an even share, then
     eight, then no share limit at all (the reserve rule still holds). */
  const SHARES=[3,8,null];

  function build({commanders,cards,definition,available={},benchOnly=false,pinned=[]}){
    const colors=new Set(commanders.flatMap(c=>c.colorIdentity||[])),issues=[],chosen=new Map(),all=new Map(cards.map(c=>[c.id,c]));
    let spend=0,relaxed=0,gameChangers=0,assumedBasics=0,splurged=0,nonbasics=0;
    const budget=definition.budget===null||definition.budget===undefined?null:Number(definition.budget);
    const perCardCap=definition.perCardCap===null||definition.perCardCap===undefined?null:Number(definition.perCardCap);
    const ceiling=Number(definition.bracketCeiling||definition.baseBracket||3);
    const maxGameChangers=ceiling>=4?Infinity:ceiling===3?3:0;
    const legal=c=>c.verified&&c.legalities?.commander==='legal'&&(c.colorIdentity||[]).every(x=>colors.has(x));
    const price=c=>{const p=c.price;if(p!==null&&p!==undefined&&Number.isFinite(p)&&p>0)return p;return isBasic(c)?BASIC_PRICE:null;};
    /* An even share of the cap per card, the line above which a card is a splurge, and how
       much may be splurged in total. The reserve floor is what the hundredth-cheapest legal
       card actually costs, so "enough left to finish" is a fact about this catalog. */
    const evenShare=budget!==null?Math.max(.05,budget/100):null;
    const splurgeLimit=budget!==null?budget*.5:null;
    const nonbasicCap=Math.min(36,8+6*Math.max(1,colors.size));
    /* What finishing the hundred from `have` cards must still cost, as a fact about this
       pool: unfilled land slots at the basic price, every other slot at the price of the
       cheapest legal spells not yet taken -- a prefix sum over the pool's prices, offset by
       how many spells are already chosen, which errs on the expensive side. Infinity when
       the pool cannot finish the deck at any price, so nothing is taken on a promise the
       catalog cannot keep. */
    const cheapList=cards.filter(c=>legal(c)&&!isBasic(c)&&role(c)!=='land'&&price(c)!==null&&!commanders.some(x=>x.id===c.id)).map(price).sort((a,b)=>a-b);
    const prefix=[0];for(const p of cheapList)prefix.push(prefix[prefix.length-1]+p);
    let chosenSpells=0;
    const reserve=have=>{const slotsAfter=Math.max(0,100-have),landsLeft=Math.min(slotsAfter,Math.max(0,36-roleCount('land'))),spells=slotsAfter-landsLeft;const from=Math.min(chosenSpells,cheapList.length),to=Math.min(cheapList.length,from+spells);if(to-from<spells)return Infinity;return landsLeft*BASIC_PRICE+(prefix[to]-prefix[from]);};
    const count=()=>[...chosen.values()].reduce((a,b)=>a+b,0);
    const lookup=id=>all.get(id)||commanders.find(c=>c.id===id);
    const roleCount=r=>[...chosen].reduce((n,[id,q])=>n+(role(lookup(id))===r?q:0),0);

    function add(c,n=1,required=false,share=null){
      if(!legal(c)){if(required)issues.push(c.name+': legality or color identity is not verified.');return false;}
      const have=chosen.get(c.id)||0,basic=isBasic(c);
      if(have&&!basic)return false;
      if(benchOnly&&(available[c.id]||0)<have+n){if(required)issues.push(c.name+': insufficient eligible copies in your selected pool.');return false;}
      if(c.gameChanger&&!basic){if(gameChangers>=maxGameChangers){if(required)issues.push(c.name+': a Game Changer beyond what bracket '+ceiling+' allows.');return false;}}
      const p=price(c);
      if(perCardCap!==null&&(p===null||p>perCardCap)){if(required)issues.push(c.name+': price is unknown or exceeds the per-card cap.');return false;}
      const land=role(c)==='land';
      if(land&&!basic&&!required&&nonbasics>=nonbasicCap)return false;
      let splurge=false;
      if(budget!==null){
        if(p===null){if(required)issues.push(c.name+': price is unknown, so it cannot be counted against the total cap.');return false;}
        if(spend+p*n+reserve(count()+n)>budget+1e-9){if(required)issues.push(c.name+': would leave too little of the total cap to finish the deck.');return false;}
        if(share!==null&&!basic&&!required&&p>Math.max(share*evenShare,.5)){
          if(splurged+p*n>splurgeLimit)return false;
          splurge=true;
        }
      }
      chosen.set(c.id,have+n);spend+=(p||0)*n;
      if(splurge)splurged+=p*n;
      if(land&&!basic)nonbasics+=n;
      if(!land&&!basic)chosenSpells+=n;
      if(c.gameChanger&&!basic)gameChangers+=1;
      if(basic&&!(c.price>0))assumedBasics+=n;
      return true;
    }

    for(const c of commanders){
      if(!legal(c)){issues.push(c.name+': legality or color identity is not verified.');continue;}
      chosen.set(c.id,1);spend+=(price(c)||0);if(c.gameChanger)gameChangers+=1;
    }
    pinned.forEach(r=>{const c=all.get(r.cardId);if(c)add(c,r.quantity,true);else issues.push('A pinned card is missing from the catalog.');});

    const text=c=>[c.oracleText,...(c.mechanics||[]),...(c.roles||[])].join(' ').toLowerCase();
    const desired=(definition.mechanics||[]).map(x=>x.toLowerCase());
    /* Popularity as a quality proxy, on a curve that can tell a staple from a filler:
       rank 1 is worth 40, rank 100 is 24, rank 10,000 is 8, unranked is 0. The old
       20/(1+log10) put three points between rank 50 and rank 5,000, less than the mana
       value term, so the fill among non-matching cards was effectively alphabetical. */
    const rankBonus=c=>c.rank?Math.max(0,40-8*Math.log10(c.rank)):0;
    /* Under a cap, the same score is worth more when it costs less: each even share of the
       cap a card costs above the first takes two points, up to thirty -- enough to prefer
       the cheaper of two similar cards, not enough to bury a staple the deck is built on. */
    const rawScore=c=>desired.filter(x=>text(c).includes(x)).length*100+(available[c.id]?30:0)+rankBonus(c)-Number(c.manaValue||0);
    const score=c=>rawScore(c)-(evenShare!==null&&price(c)!==null?Math.min(30,Math.max(0,price(c)-evenShare)/evenShare*2):0);
    const pool=cards.filter(c=>legal(c)&&!commanders.some(x=>x.id===c.id)).sort((a,b)=>score(b)-score(a)||a.name.localeCompare(b.name));
    const basics=(()=>{const names=colors.size?[...colors].map(x=>({W:'Plains',U:'Island',B:'Swamp',R:'Mountain',G:'Forest'})[x]):['Wastes'];return names.map(n=>cards.find(c=>c.name===n)).filter(Boolean);})();

    function fillBasics(target){let failed=0,i=0;while(basics.length&&roleCount('land')<target&&count()<100&&failed<basics.length){if(add(basics[i++%basics.length]))failed=0;else failed++;}}

    /* Roles in order, then everything else; three passes of the same loop, each allowing
       a card a larger slice of what is left, and only while the list is short. */
    for(const share of (budget===null?[null]:SHARES)){
      if(count()>=100)break;
      if(budget!==null&&share!==SHARES[0])relaxed+=1;
      for(const [r,target] of TARGETS){
        const candidates=pool.filter(c=>r==='engine'?role(c)!=='land':role(c)===r);
        for(const c of candidates){if(count()>=100||r!=='engine'&&roleCount(r)>=target)break;add(c,1,false,share);}
        if(r==='land')fillBasics(target);
      }
    }

    /* THE UPGRADE PASS. The fill above is cautious by construction; this spends what the
       caution left over. Same-role swaps keep the balance the targets set; the commander,
       pinned cards and basics are never swapped out; the splurge limit still bounds how
       much of the cap the staples may take. */
    let upgrades=0;
    if(budget!==null&&count()===100){
      const swappable=id=>{const c=lookup(id);return c&&!commanders.some(x=>x.id===id)&&!pinned.some(r=>r.cardId===id)&&!isBasic(c)&&(chosen.get(id)||0)===1;};
      const candidates=pool.filter(c=>!chosen.has(c.id)&&price(c)!==null&&!isBasic(c)&&(perCardCap===null||price(c)<=perCardCap)).sort((a,b)=>rawScore(b)-rawScore(a));
      for(const cand of candidates){
        if(upgrades>=30||spend>=budget*.97)break;
        const p=price(cand),r=role(cand);
        if(spend+p>budget+1e-9)continue;
        if(cand.gameChanger&&gameChangers>=maxGameChangers)continue;
        if(r==='land'&&nonbasics>=nonbasicCap)continue;
        const isSplurge=p>Math.max(SHARES[0]*evenShare,.5);
        if(isSplurge&&splurged+p>splurgeLimit)continue;
        const weakest=[...chosen.keys()].filter(id=>swappable(id)&&role(lookup(id))===r).map(lookup).sort((a,b)=>rawScore(a)-rawScore(b))[0];
        if(!weakest||rawScore(cand)<=rawScore(weakest)+5)continue;
        const wp=price(weakest)||0;
        if(spend-wp+p>budget+1e-9)continue;
        chosen.delete(weakest.id);chosen.set(cand.id,1);spend+=p-wp;upgrades+=1;
        if(isSplurge)splurged+=p;
        if(weakest.gameChanger)gameChangers-=1;if(cand.gameChanger)gameChangers+=1;
      }
    }

    if(count()!==100){
      const why=[];
      if(benchOnly&&!Object.keys(available).length)why.push('the pool is limited to your owned copies and your library holds none — switch the pool to "All legal catalog cards" or import your collection first');
      else if(benchOnly)why.push('the pool is limited to your owned copies');
      if(budget!==null)why.push(`the total price cap is $${budget}`);
      if(perCardCap!==null)why.push(`the per-card cap is $${perCardCap}`);
      let advice='';
      if(budget!==null){
        /* What the cap would have to be: today's spend plus the cheapest legal cards that
           would fill the rest, so the number is a real figure and not a guess. */
        /* The same arithmetic the reserve rule used, so the figure offered is one the
           rule will accept: unfilled land slots at the basic price, the rest at the floor. */
        const needed=reserve(count());
        if(Number.isFinite(needed))advice=` Raising the total cap to about $${Math.ceil(spend+needed)} completes the list.`;
        else advice=' The catalog does not hold enough priced legal cards to finish this deck under any cap; add cards or remove the cap.';
      }
      issues.push(`Only ${count()} of 100 cards could be chosen`+(why.length?' because '+why.join(' and '):' within the catalog')+'. No hard limit was crossed.'+advice);
    }

    const result=[...chosen].map(([cardId,quantity])=>({cardId,quantity,purpose:'main',pinned:pinned.some(r=>r.cardId===cardId)}));
    const notes=['36 lands, 10 ramp, 10 draw and 10 interaction are starting targets, with overlapping abilities counted once.'];
    if(budget!==null){
      notes.push(`Total cap $${budget}: this list prices at about $${spend.toFixed(2)}`+(assumedBasics?`, counting ${assumedBasics} basic lands at $${BASIC_PRICE.toFixed(2)} each where no price is recorded`:'')+'.'
        +(splurged?` About $${splurged.toFixed(2)} of it went to cards above $${(SHARES[0]*evenShare).toFixed(2)}, the deck's staples.`:'')
        +(upgrades?` ${upgrades} of the first picks were then upgraded with what the cap had left.`:'')
        +(relaxed?` To fill it, the per-card share of the cap was loosened ${relaxed===1?'once':'twice'}; the cap itself was never exceeded.`:''));
    }
    if(maxGameChangers!==Infinity)notes.push(`Bracket ceiling ${ceiling}: ${maxGameChangers===0?'no Game Changers were chosen':'at most three Game Changers were chosen ('+gameChangers+' in this list)'}.`);
    notes.push('Play style, speed, competitiveness and saltiness require your review. This initial pass does not steer by them and does not certify them.');
    return {slots:result,cards:[...new Set([...chosen.keys()])].map(lookup),issues,estimatedPrice:spend,relaxed,gameChangers,splurged,nonbasics,upgrades,
      unknownPrices:result.filter(r=>price(lookup(r.cardId))===null).length,method:'Constructive metadata draft; not simulated',notes};
  }
  return {build,role,BASIC_PRICE};
});
