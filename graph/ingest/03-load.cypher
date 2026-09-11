// Loads the CSVs from 02-build-csv.mjs. Run after schema/constraints.cypher.
//   cat graph/schema/constraints.cypher graph/ingest/03-load.cypher | cypher-shell -u neo4j -p mtggraph

// DERIVED EDGES ARE REPLACED, NOT MERGED ONTO. Every edge below is a function of the
// rules text and the classifier; a reload that only MERGEs keeps every edge the previous
// classifier drew, and the database drifts from its own source without a single error.
// The 2026-09 audit found 3,085 CAUSES edges to an event the classifier had retired and
// 1,007 IS_TRIBE edges to "//" and "Legendary" still standing after a rebuild. Cards,
// Printings and the overlays (OWNS, ASSIGNED_TO) are keyed and safe to MERGE; these are not.
MATCH ()-[r:FILLS|CAUSES|TRIGGERS_ON|PRODUCES|CONSUMES|REQUIRES|HAS_MECHANIC|IS_TRIBE|WANTS_TRIBE|MAKES_TRIBE|WANTS_STAT|OFFERS_STAT]->()
CALL (r) { DELETE r } IN TRANSACTIONS OF 20000 ROWS;
MATCH (n) WHERE (n:Event OR n:Resource OR n:Role OR n:Mechanic OR n:Tribe OR n:Stat) AND NOT (n)--()
CALL (n) { DELETE n } IN TRANSACTIONS OF 20000 ROWS;

LOAD CSV WITH HEADERS FROM 'file:///cards.csv' AS r
CALL (r) {
  MERGE (c:Card {oracleId: r.oracleId})
  SET c.name = r.name, c.manaValue = toFloat(r.manaValue), c.colorIdentity = r.colorIdentity,
      c.colors = size(coalesce(r.colorIdentity,'')), c.typeLine = r.typeLine, c.rarity = r.rarity,
      c.setName = r.setName, c.priceUsd = toFloat(r.priceUsd), c.priceFoil = toFloat(r.priceFoil),
      c.edhrecRank = toInteger(r.edhrecRank), c.isLand = (r.isLand = 'true'),
      c.canBeCommander = (r.canBeCommander = 'true'), c.image = r.image, c.commanderLegal = true,
      c.tcgUri = r.tcgUri, c.printings = toInteger(r.printings),
      c.power = r.power, c.toughness = r.toughness,
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

// The tribe a card is a payoff FOR, as opposed to the tribe it is. Goblin Chieftain
// IS_TRIBE Goblin and WANTS_TRIBE Goblin; Coat of Arms wants none by name.
LOAD CSV WITH HEADERS FROM 'file:///wants.csv' AS r
CALL (r) { MATCH (c:Card {oracleId: r.oracleId}) MERGE (t:Tribe {id: r.tribe}) MERGE (c)-[:WANTS_TRIBE]->(t) }
IN TRANSACTIONS OF 5000 ROWS;

// The tribe of the tokens a card creates: Krenko MAKES_TRIBE Goblin. The supply side of
// the tribal join, for payoffs whose members are tokens rather than cards.
LOAD CSV WITH HEADERS FROM 'file:///makes.csv' AS r
CALL (r) { MATCH (c:Card {oracleId: r.oracleId}) MERGE (t:Tribe {id: r.tribe}) MERGE (c)-[:MAKES_TRIBE]->(t) }
IN TRANSACTIONS OF 5000 ROWS;

// The stat a card pays off, and the stat a body offers. The first is read off rules text,
// the second off the printed numbers -- a 0/4 Wall says nothing about being a wall.
LOAD CSV WITH HEADERS FROM 'file:///wants_stat.csv' AS r
CALL (r) { MATCH (c:Card {oracleId: r.oracleId}) MERGE (s:Stat {id: r.stat}) MERGE (c)-[:WANTS_STAT]->(s) }
IN TRANSACTIONS OF 5000 ROWS;

LOAD CSV WITH HEADERS FROM 'file:///offers_stat.csv' AS r
CALL (r) { MATCH (c:Card {oracleId: r.oracleId}) MERGE (s:Stat {id: r.stat}) MERGE (c)-[:OFFERS_STAT]->(s) }
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
