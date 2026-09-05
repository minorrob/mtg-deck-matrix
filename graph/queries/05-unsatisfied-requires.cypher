// Payoffs with nothing to pay them off. A hard REQUIRES that no card in the same
// deck FILLS is a dead card you are choosing to draw.
MATCH (c:Card)-[a:ASSIGNED_TO]->(d:Deck), (c)-[q:REQUIRES]->(need:Role)
WHERE a.target > 0 AND q.strength = 'hard'
OPTIONAL MATCH (s:Card)-[a2:ASSIGNED_TO]->(d) WHERE a2.target > 0 AND (s)-[:FILLS]->(need)
WITH d, need, count(DISTINCT c) AS payoffs, count(DISTINCT s) AS enablers
WHERE enablers < 2
RETURN d.name AS deck, need.id AS requires, payoffs, enablers
ORDER BY payoffs DESC LIMIT 15;
