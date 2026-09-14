/* THE ENVELOPE EVERY GENERATED FILE WEARS. {schema, <stamp>, generator, count} come first,
 * then the body -- so the first line of any data file says what it is, when it was made,
 * what made it and how much it holds, and schema/index.mjs can check all four without
 * knowing the body. A body that already carries a stamp (compiledAt, savedAt, createdAt,
 * amplifiersAt…) keeps it; only a body with none gets generatedAt. */
export const STAMPS = ["generatedAt", "compiledAt", "savedAt", "createdAt", "amplifiersAt", "measuredAt", "importedAt", "exportedAt", "builtAt", "updatedAt", "revision"];

export function stamp(schema, generator, body = {}, {count, at = new Date().toISOString()} = {}) {
  const {schema: _s, generator: _g, count: _c, ...rest} = body;
  const stamped = STAMPS.some((k) => k in rest);
  return {schema, ...(stamped ? {} : {generatedAt: at}), generator, ...(count === undefined ? {} : {count}), ...rest};
}
