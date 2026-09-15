export const manaColors=['W','U','B','R','G','C'];
const basics={Plains:'W',Island:'U',Swamp:'B',Mountain:'R',Forest:'G'};
// Display source counts, never a payment plan. Restrictions remain engine-owned.
export function sourceColors(card,identity=[],opponentColors=[]){
  const colors=new Set();
  if(card.faceDown)return [];
  if(card.typeLine?.includes('Land'))for(const [type,color]of Object.entries(basics))if(new RegExp('\\b'+type+'\\b').test(card.typeLine))colors.add(color);
  for(const line of (card.oracleText||'').split('\n')){
    if(!/^[^:]*:\s*Add\b/i.test(line)||/create|[“"]|whenever|when |at the /i.test(line.slice(0,line.indexOf(':'))))continue;
    const effect=line.slice(line.indexOf(':')+1);
    if(/opponent|opponents/.test(effect))opponentColors.filter(c=>c!=='C').forEach(c=>colors.add(c));
    else if(/commander.s color identity/.test(effect))identity.forEach(c=>colors.add(c));
    else if(/any color|any one color|any combination of colors/.test(effect))manaColors.slice(0,5).forEach(c=>colors.add(c));
    else for(const match of effect.matchAll(/\{([WUBRGC])\}/g))colors.add(match[1]);
  }
  return [...colors];
}
export function manaStatus(player,players,identity=[]){
  const opposing=[...new Set(players.filter(p=>p.playerId!==player.playerId).flatMap(p=>p.zones.Battlefield.cards.filter(c=>c.typeLine?.includes('Land')).flatMap(c=>sourceColors(c))))];
  const counts=Object.fromEntries(manaColors.map(c=>[c,{untapped:0,tapped:0,floating:0}]));let shared=0;
  for(const card of player.zones.Battlefield.cards){const colors=sourceColors(card,identity,opposing);if(colors.length>1)shared++;for(const color of colors)if(counts[color])counts[color][card.tapped?'tapped':'untapped']++;}
  for(const mana of player.mana||[])if(counts[mana.color])counts[mana.color].floating++;
  return {counts,shared};
}
