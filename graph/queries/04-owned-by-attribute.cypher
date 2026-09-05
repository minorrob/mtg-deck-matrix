// The simple case: only what I own, sharing a characteristic. This is the shape
// every side-pane toggle compiles down to.
//   :param role => 'ramp'   :param maxCmc => 2   :param identity => 'GWUB'
MATCH (:Collection)-[o:OWNS]->(c:Card)-[:FILLS]->(r:Role {id: $role})
WHERE c.manaValue <= $maxCmc
  AND (c.colorIdentity IS NULL OR ALL(ch IN split(c.colorIdentity,'') WHERE ch IN split($identity,'')))
OPTIONAL MATCH (c)-[a:ASSIGNED_TO]->(d:Deck) WHERE a.actual > 0
RETURN c.name AS card, c.manaValue AS mv, c.colorIdentity AS ci, c.priceUsd AS price,
       o.qty AS own, o.ordered AS ordered,
       collect(d.name) AS inDecks,
       o.qty + o.ordered - size(collect(d.name)) AS free
ORDER BY free DESC, c.manaValue, c.name;
