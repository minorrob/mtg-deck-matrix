/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Printed defense is Oracle identity data (CR 310.4a), not the changing counter total in a game. */
export function oracleDefenseProblems(script, oracle) {
  const name = script?.identity?.name ?? "Unnamed definition";
  if (!oracle) return [`${name}: no committed Oracle identity`];
  const problems = [];
  const hasFaces = Array.isArray(oracle.faces) && oracle.faces.length > 1;
  const front = hasFaces ? oracle.faces[0] : oracle;
  const shown = value => value === undefined ? "absent" : JSON.stringify(value);
  const checkFace = (face, raw, label) => {
    const printed = raw?.defense;
    const battle = String(raw?.type ?? "").split(" — ")[0].split(" ").includes("Battle");
    let expected;
    if (printed != null) {
      const integer = typeof printed === "number" || (typeof printed === "string" && /^[+-]?\d+$/.test(printed));
      expected = integer ? Number(printed) : NaN;
      if (!Number.isSafeInteger(expected) || expected < 0) {
        problems.push(`${name}: ${label} has invalid Oracle printed defense`);
        return;
      }
    } else if (battle) {
      problems.push(`${name}: ${label} Battle has no Oracle printed defense`);
      return;
    }
    const actual = face?.identity?.defense ?? undefined;
    if (actual !== expected) problems.push(`${name}: ${label} defense ${shown(actual)} is not Oracle ${shown(expected)}`);
  };
  checkFace(script, front, "front");
  if (hasFaces || script?.back || script?.adventure || script?.prepare)
    checkFace(script?.back ?? script?.adventure ?? script?.prepare, hasFaces ? oracle.faces[1] : undefined, "second face");
  return problems;
}
