// The model's central claim: synergy is a PATH, never an authored pair.
// Give it a commander; it returns cards that feed the events that commander
// listens for, and names the event that connects them.
//   :param commander => 'Purphoros, God of the Forge'
MATCH (cmd:Card {name: $commander})-[:TRIGGERS_ON]->(e:Event)<-[x:CAUSES]-(c:Card)
WHERE c <> cmd
  AND (c.colorIdentity IS NULL OR ALL(ch IN split(c.colorIdentity,'') WHERE ch IN split(coalesce(cmd.colorIdentity,''),'')))
OPTIONAL MATCH (:Collection)-[o:OWNS]->(c)
RETURN c.name AS card, c.manaValue AS mv, collect(DISTINCT e.id) AS through,
       x.rate AS rate, c.priceUsd AS price,
       coalesce(o.qty,0) + coalesce(o.ordered,0) AS youHave, c.edhrecRank AS rank
ORDER BY (CASE WHEN c.edhrecRank IS NULL THEN 999999 ELSE c.edhrecRank END) ASC
LIMIT 25;
