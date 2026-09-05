// "Am I playing the deck I designed?" -- the query that found Atraxa had drifted
// twelve cards from its own target, three of them accelerants, at zero cost to fix.
MATCH (c:Card)-[a:ASSIGNED_TO]->(d:Deck)
WITH d, sum(a.target) AS target, sum(a.actual) AS actual,
     sum(CASE WHEN a.target > a.actual THEN a.target - a.actual ELSE 0 END) AS missing
OPTIONAL MATCH (c2:Card)-[a2:ASSIGNED_TO]->(d) WHERE a2.target > a2.actual
OPTIONAL MATCH (:Collection)-[o:OWNS]->(c2)
WITH d, target, actual, missing,
     sum(CASE WHEN coalesce(o.qty,0) + coalesce(o.ordered,0) > 0 THEN a2.target - a2.actual ELSE 0 END) AS haveOnHand
RETURN d.name AS deck, target, actual, missing, haveOnHand,
       missing - haveOnHand AS mustBuy
ORDER BY missing DESC;
