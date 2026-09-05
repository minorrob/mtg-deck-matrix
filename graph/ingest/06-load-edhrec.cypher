// PLAYED_WITH: measured co-occurrence from EDHREC, scoped to a commander.
LOAD CSV WITH HEADERS FROM 'file:///played_with.csv' AS r
CALL (r) {
  MATCH (cmd:Card {oracleId: r.commanderId}), (c:Card {oracleId: r.cardId})
  MERGE (cmd)-[p:PLAYED_WITH]->(c)
  SET p.numDecks = toInteger(r.numDecks), p.potentialDecks = toInteger(r.potentialDecks),
      p.inclusion = toFloat(r.inclusion), p.synergy = toFloat(r.synergy), p.category = r.category
} IN TRANSACTIONS OF 5000 ROWS;
CREATE INDEX played_synergy IF NOT EXISTS FOR ()-[p:PLAYED_WITH]-() ON (p.synergy);
