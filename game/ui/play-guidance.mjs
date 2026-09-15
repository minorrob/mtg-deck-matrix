// Local, explainable coaching. Only the human hand and public battlefield are read.
const board=p=>p?.zones?.Battlefield?.cards||[];
const creatures=p=>board(p).filter(c=>c.typeLine?.includes('Creature'));
export function recommendedActions(state,ui,history=[]){
  const you=state?.players?.find(p=>p.playerId===0);if(!you||state.turnPlayerId!==0)return [];
  const rows=[],add=(title,reason,cardId)=>rows.push({title,reason,...(cardId!=null?{cardId}:{})});
  const phase=state.phase,hand=you.zones.Hand.cards,opponents=state.players.filter(p=>p.playerId!==0&&p.health?.status!=='out');
  if(ui.nativeFallback){add('Complete the pending choice',ui.nativeFallback);return rows;}
  if(ui.choice){add(ui.choice.mode==='draw'?'Draw your card':'Resolve the current choice',ui.choice.mode==='draw'?'Double-click your library. Suggestions update after the card reaches your hand.':ui.choice.title);return rows;}
  if(state.stackSize){
    add('Review the stack before passing',`${state.stackSize} spell or ability ${state.stackSize===1?'is':'are'} waiting. Check targets and which of your permanents could be affected.`);
    const responses=hand.filter(c=>/Instant/.test(c.typeLine)||/\bflash\b/i.test(c.oracleText)).filter(c=>ui.cardActions?.[c.cardId]);
    for(const c of responses.slice(0,2))add(`Consider ${c.name}`,'An instant-speed option is offered by the engine. Inspect its targets and cost before responding.',c.cardId);return rows;
  }
  if(/UNTAP|UPKEEP/.test(phase)){add('Check beginning-of-turn effects','Let mandatory effects resolve; choose any optional upkeep actions before drawing.');return rows;}
  if(phase==='DRAW'){add('Review your new hand','Check the new card against your mana and the opposing boards before moving to main phase 1.');return rows;}
  if(/COMBAT/.test(phase)){
    if(ui.inputType==='InputAttack'||/Select creatures to attack/i.test(ui.prompt)){
      const safest=opponents.toSorted((a,b)=>creatures(a).filter(c=>!c.tapped).length-creatures(b).filter(c=>!c.tapped).length)[0];
      if(safest)add(`Review an attack on ${safest.name}`,`${creatures(safest).filter(c=>!c.tapped).length} untapped creatures are visible there. Check evasion, open mana and attack triggers; this is not a prediction of safe damage.`);
      add('Keep necessary blockers back',`You have ${you.health?.life??you.life} life. Choose a defender, then toggle attackers in Combat. Confirm only after reviewing each assignment.`);
    }else add('Review combat before continuing','Inspect blocker assignments and damage keywords in Combat. Use an instant or flash card while you have priority if it improves the exchange.');return rows;
  }
  if(['MAIN1','MAIN2'].includes(phase)){
    const legal=c=>!!ui.cardActions?.[c.cardId];
    const lands=hand.filter(c=>/Land/.test(c.typeLine)&&legal(c));
    if(lands.length)add(`Play a land: ${lands[0].name}`,'Use your available land play before spending mana; inspect the colors it provides and whether it enters tapped.',lands[0].cardId);
    const threats=opponents.flatMap(p=>creatures(p).map(c=>({...c,playerName:p.name}))).toSorted((a,b)=>(b.power||0)-(a.power||0));
    const options=[...hand,...you.zones.Command.cards].filter(c=>!c.typeLine?.includes('Land')&&legal(c)).map(c=>{
      const text=c.oracleText||'';let score=1,reason='Develop your board while keeping mana available for responses.';
      if(/add .*mana|add \{|search your library.*land/i.test(text)&&board(you).length<7){score=4;reason='Early mana development can unlock more of your hand on later turns.';}
      if(/draw (a|two|three|\d+) cards?/i.test(text)&&hand.length<=4){score=5;reason=`You have ${hand.length} cards in hand; drawing cards can replenish your options.`;}
      if(threats[0]?.power>=5&&/(destroy|exile) target.*(creature|permanent)/i.test(text)){score=6;reason=`${threats[0].playerName} controls ${threats[0].name} (${threats[0].power}/${threats[0].toughness}). Check whether this spell can legally answer that threat.`;}
      if(you.zones.Command.cards.some(x=>x.cardId===c.cardId)){score+=2;reason='Your commander can enable the deck’s main plan. Account for commander tax and opponents’ open mana.';}
      return {c,score,reason};
    }).toSorted((a,b)=>b.score-a.score);
    for(const {c,reason}of options.slice(0,Math.max(1,3-rows.length)))add(`Consider ${c.name}`,reason,c.cardId);
    if(!rows.length)add('Review abilities or continue','No hand or command-zone action is currently offered. Inspect your permanents for useful abilities, or advance the phase.');
    return rows;
  }
  add('Check end-step triggers and keep interaction ready','Resolve optional triggers and review hand size before ending your turn. Unspent mana normally empties as the step ends.');return rows;
}

export function combatTotals(attacks=[]){
  const defenders=new Map();
  for(const row of attacks){if(!row.defender)continue;const key=row.defender.kind+':'+row.defender.id;let total=defenders.get(key);if(!total){total={...row.defender,power:0,unblockedPower:0,commanderPower:0,infectPower:0};defenders.set(key,total);}const power=Math.max(0,Number(row.attacker.power)||0);total.power+=power;if(!row.blocked&&!row.blockers.length)total.unblockedPower+=power;if(row.attacker.commander)total.commanderPower+=power;if(row.attacker.keywords?.includes('infect'))total.infectPower+=power;}
  return [...defenders.values()];
}
