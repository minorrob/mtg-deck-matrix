(globalThis.CrankFeatures ||= []).push(function(C){
  const {esc:e}=C;
  async function attachMatchReport(report){
    if(report?.schema!=='CrankMagicOnlineMatchReport@1'||typeof report.matchId!=='string'||!Number.isInteger(report.seatId))throw Error('The game returned an invalid match report.');
    const deckId=report.deck?.source?.deckId,deck=C.state.decks.find(d=>d.id===deckId&&!d.archived);if(!deck)throw Error('The deck used for this match is no longer in this library.');
    if(C.state.games.some(game=>game.online?.matchId===report.matchId&&game.online?.seatId===report.seatId))return 'already attached';
    const opponents=(report.opponents||[]).map(item=>(item.commanders||[]).join(' + ')+(item.kind==='ai'&&item.difficulty?` · AI difficulty ${item.difficulty}`:'')).join('; ');
    await C.commit({type:'game',gameId:`game:online:${report.matchId}:${report.seatId}`,deckId,outcome:report.outcome,playedAt:report.completedAt,finish:report.finish,pod:report.podSize,bracket:report.bracket,turns:report.turns,seat:report.seatId+1,opponents,notes:report.playerFeedback?.notes||'CrankMagic Online match. Open the report from game history for event telemetry and deck signals.',online:report});
    C.notice('Online game report attached to '+deck.name+'.');return 'attached';
  }
  // HOTFIX 2026-09-17: do not overwrite C.views.game — classic lobby lives in crankmagic-game.js.
  // Online host bridge / review iframe was replacing Desktop #game with nested Loading tabletop.
  C.views.online=()=>{location.hash='game';};
});
