// Loads the CSVs from 02-build-csv.mjs. Run after schema/constraints.cypher.
//   cat graph/schema/constraints.cypher graph/ingest/03-load.cypher | cypher-shell -u neo4j -p mtggraph

LOAD CSV WITH HEADERS FROM 'file:///cards.csv' AS r
CALL (r) {
  MERGE (c:Card {oracleId: r.oracleId})
  SET c.name = r.name, c.manaValue = toFloat(r.manaValue), c.colorIdentity = r.colorIdentity,
      c.colors = size(coalesce(r.colorIdentity,'')), c.typeLine = r.typeLine, c.rarity = r.rarity,
      c.setName = r.setName, c.priceUsd = toFloat(r.priceUsd), c.priceFoil = toFloat(r.priceFoil),
      c.edhrecRank = toInteger(r.edhrecRank), c.isLand = (r.isLand = 'true'),
      c.canBeCommander = (r.canBeCommander = 'true'), c.image = r.image, c.commanderLegal = true,
      c.tcgUri = r.tcgUri, c.printings = toInteger(r.printings),
      c.cheapestSet = r.setName
} IN TRANSACTIONS OF 5000 ROWS;

LOAD CSV WITH HEADERS FROM 'file:///fills.csv' AS r
CALL (r) {
  MATCH (c:Card {oracleId: r.oracleId}) MERGE (x:Role {id: r.role})
  MERGE (c)-[f:FILLS]->(x) SET f.weight = toFloat(r.weight)
} IN TRANSACTIONS OF 5000 ROWS;

LOAD CSV WITH HEADERS FROM 'file:///causes.csv' AS r
CALL (r) {
  MATCH (c:Card {oracleId: r.oracleId}) MERGE (e:Event {id: r.event})
  MERGE (c)-[x:CAUSES]->(e) SET x.rate = r.rate
} IN TRANSACTIONS OF 5000 ROWS;

LOAD CSV WITH HEADERS FROM 'file:///triggers.csv' AS r
CALL (r) {
  MATCH (c:Card {oracleId: r.oracleId}) MERGE (e:Event {id: r.event})
  MERGE (c)-[x:TRIGGERS_ON]->(e) SET x.yoursOnly = (r.yoursOnly = 'true')
} IN TRANSACTIONS OF 5000 ROWS;

LOAD CSV WITH HEADERS FROM 'file:///produces.csv' AS r
CALL (r) { MATCH (c:Card {oracleId: r.oracleId}) MERGE (x:Resource {id: r.resource}) MERGE (c)-[:PRODUCES]->(x) }
IN TRANSACTIONS OF 5000 ROWS;

LOAD CSV WITH HEADERS FROM 'file:///consumes.csv' AS r
CALL (r) { MATCH (c:Card {oracleId: r.oracleId}) MERGE (x:Resource {id: r.resource}) MERGE (c)-[:CONSUMES]->(x) }
IN TRANSACTIONS OF 5000 ROWS;

LOAD CSV WITH HEADERS FROM 'file:///requires.csv' AS r
CALL (r) {
  MATCH (c:Card {oracleId: r.oracleId}) MERGE (x:Role {id: r.role})
  MERGE (c)-[q:REQUIRES]->(x) SET q.strength = r.strength
} IN TRANSACTIONS OF 5000 ROWS;

LOAD CSV WITH HEADERS FROM 'file:///mechanics.csv' AS r
CALL (r) { MATCH (c:Card {oracleId: r.oracleId}) MERGE (m:Mechanic {id: r.mechanic}) MERGE (c)-[:HAS_MECHANIC]->(m) }
IN TRANSACTIONS OF 5000 ROWS;

LOAD CSV WITH HEADERS FROM 'file:///tribes.csv' AS r
CALL (r) { MATCH (c:Card {oracleId: r.oracleId}) MERGE (t:Tribe {id: r.tribe}) MERGE (c)-[:IS_TRIBE]->(t) }
IN TRANSACTIONS OF 5000 ROWS;

// --- your overlays. These are the only mutable part of the graph. -----------
MERGE (:Collection {id: 'my'});
LOAD CSV WITH HEADERS FROM 'file:///owns.csv' AS r
CALL (r) {
  MATCH (c:Card {name: r.name}) MATCH (col:Collection {id: 'my'})
  MERGE (col)-[o:OWNS]->(c)
  SET o.qty = toInteger(r.own), o.ordered = toInteger(r.ordered), o.bench = toInteger(r.bench),
      o.state = CASE WHEN toInteger(r.own) > 0 THEN 'owned'
                     WHEN toInteger(r.ordered) > 0 THEN 'ordered' ELSE 'wanted' END
} IN TRANSACTIONS OF 1000 ROWS;

LOAD CSV WITH HEADERS FROM 'file:///assigned.csv' AS r
CALL (r) {
  MATCH (c:Card {name: r.name}) MERGE (d:Deck {id: r.deckId}) SET d.name = r.deckName
  MERGE (c)-[a:ASSIGNED_TO]->(d)
  SET a.target = toInteger(r.target), a.actual = toInteger(r.actual), a.state = r.state
} IN TRANSACTIONS OF 1000 ROWS;
