// Curve versus early acceleration, per deck. A deck whose average cost outruns the
// mana it can deploy before turn three loses games it never got to play.
MATCH (c:Card)-[a:ASSIGNED_TO]->(d:Deck) WHERE a.target > 0
WITH d,
     avg(CASE WHEN NOT c.isLand THEN c.manaValue END) AS avgCost,
     sum(CASE WHEN c.isLand THEN a.target ELSE 0 END) AS lands,
     sum(CASE WHEN (c)-[:FILLS]->(:Role {id:'ramp'}) AND NOT c.isLand THEN a.target ELSE 0 END) AS ramp,
     sum(CASE WHEN (c)-[:FILLS]->(:Role {id:'ramp'}) AND NOT c.isLand
                   AND c.manaValue <= 2 THEN a.target ELSE 0 END) AS fastRamp
RETURN d.name AS deck, round(avgCost,2) AS avgCost, lands, ramp, fastRamp,
       lands + ramp AS sources,
       CASE WHEN fastRamp < avgCost * 1.5 THEN 'SHORT' ELSE 'ok' END AS verdict
ORDER BY fastRamp;
