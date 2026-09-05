// Identity is Scryfall's oracle_id, not the name: renames and reprints must not
// split a card in two, and two cards can legitimately share a name across faces.
CREATE CONSTRAINT card_oracle IF NOT EXISTS FOR (c:Card)     REQUIRE c.oracleId IS UNIQUE;
CREATE CONSTRAINT printing_id IF NOT EXISTS FOR (p:Printing) REQUIRE p.scryfallId IS UNIQUE;
CREATE CONSTRAINT event_id    IF NOT EXISTS FOR (e:Event)    REQUIRE e.id IS UNIQUE;
CREATE CONSTRAINT resource_id IF NOT EXISTS FOR (r:Resource) REQUIRE r.id IS UNIQUE;
CREATE CONSTRAINT role_id     IF NOT EXISTS FOR (r:Role)     REQUIRE r.id IS UNIQUE;
CREATE CONSTRAINT mech_id     IF NOT EXISTS FOR (m:Mechanic) REQUIRE m.id IS UNIQUE;
CREATE CONSTRAINT theme_id    IF NOT EXISTS FOR (t:Theme)    REQUIRE t.id IS UNIQUE;
CREATE CONSTRAINT tribe_id    IF NOT EXISTS FOR (t:Tribe)    REQUIRE t.id IS UNIQUE;
CREATE CONSTRAINT deck_id     IF NOT EXISTS FOR (d:Deck)     REQUIRE d.id IS UNIQUE;

CREATE INDEX card_name   IF NOT EXISTS FOR (c:Card) ON (c.name);
CREATE INDEX card_cmc    IF NOT EXISTS FOR (c:Card) ON (c.manaValue);
CREATE INDEX card_legal  IF NOT EXISTS FOR (c:Card) ON (c.commanderLegal);
