// The two signals checked against each other, for one commander.
//   :param commander => 'Purphoros, God of the Forge'
//
// AGREE     both say yes -- highest confidence, and where to shop first.
// TEXT-ONLY the oracle text connects it but almost nobody plays it. Either a real
//           gem, or -- far more often -- our extraction matched something it
//           should not have. This column is the standing audit of the edge rules.
// PLAY-ONLY the field plays it heavily and our text rules see no connection at
//           all. That is an interaction the extraction is missing.
MATCH (cmd:Card {name: $commander})
OPTIONAL MATCH (cmd)-[:TRIGGERS_ON]->(e:Event)<-[r:CAUSES|TRIGGERS_ON]-(mech:Card)
  WHERE ALL(ch IN split(mech.colorIdentity,'') WHERE ch IN split(cmd.colorIdentity,''))
// CAUSES feeds the commander's trigger; a second TRIGGERS_ON is a co-payoff -- another
// card cashing the same event. Impact Tremors is in 87% of Purphoros decks and is that
// shape exactly, so a path that only looked for CAUSES could never see it.
WITH cmd, collect(DISTINCT mech) AS mechanical
MATCH (cmd)-[p:PLAYED_WITH]->(c:Card) WHERE p.inclusion >= 0.10
WITH cmd, mechanical, c, p
RETURN c.name AS card,
       CASE WHEN c IN mechanical THEN 'AGREE' ELSE 'PLAY-ONLY' END AS verdict,
       round(p.inclusion * 100) AS pctOfDecks, round(p.synergy, 3) AS synergy,
       c.manaValue AS mv, c.priceUsd AS price
ORDER BY p.synergy DESC LIMIT 20;
