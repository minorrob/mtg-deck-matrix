/* A SMALL JSON SCHEMA VALIDATOR, so the data contracts under schema/ can be checked with no
 * dependency -- by the suites, by a tool's --check, and by anyone reading the schema file.
 *
 * The subset it understands is the subset the schemas use: type (one or several), enum,
 * const, required, properties, additionalProperties (boolean or a schema), items,
 * prefixItems, minItems, maxItems, minimum, maximum, minLength, pattern, anyOf and
 * format "date-time". A keyword outside this list is a mistake in the schema, and it says
 * so rather than passing silently. Errors are returned, never thrown, as "path: message". */

const KNOWN = new Set(["$schema", "$id", "title", "description", "type", "enum", "const", "required", "properties",
  "additionalProperties", "items", "prefixItems", "minItems", "maxItems", "minimum", "maximum", "minLength", "pattern",
  "anyOf", "format", "examples"]);

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}
function hasType(value, want) {
  const t = typeOf(value);
  return want === t || (want === "number" && t === "integer");
}

export function validate(schema, value, path = "$", errors = []) {
  for (const key of Object.keys(schema)) if (!KNOWN.has(key)) errors.push(`${path}: schema keyword "${key}" is not one this validator reads`);
  if (schema.anyOf) {
    const ok = schema.anyOf.some((s) => validate(s, value, path, []).length === 0);
    if (!ok) errors.push(`${path}: matches none of the ${schema.anyOf.length} allowed shapes`);
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => hasType(value, t))) { errors.push(`${path}: expected ${types.join(" or ")}, found ${typeOf(value)}`); return errors; }
  }
  if ("const" in schema && JSON.stringify(value) !== JSON.stringify(schema.const)) errors.push(`${path}: expected ${JSON.stringify(schema.const)}, found ${JSON.stringify(value)}`);
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) errors.push(`${path}: ${JSON.stringify(value)} is not one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}`);
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: "${value.slice(0, 40)}" does not match ${schema.pattern}`);
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) errors.push(`${path}: "${value}" is not a date-time`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: ${value} is below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: ${value} is above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: ${value.length} items, at least ${schema.minItems} expected`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: ${value.length} items, at most ${schema.maxItems} expected`);
    const prefix = schema.prefixItems || [];
    value.forEach((item, i) => {
      const s = i < prefix.length ? prefix[i] : schema.items;
      if (s) validate(s, item, `${path}[${i}]`, errors);
      if (errors.length > 200) return;
    });
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!(key in value)) errors.push(`${path}: missing "${key}"`);
    const props = schema.properties || {};
    for (const [key, s] of Object.entries(props)) if (key in value) validate(s, value[key], `${path}.${key}`, errors);
    if (schema.additionalProperties !== undefined && schema.additionalProperties !== true) {
      for (const key of Object.keys(value)) {
        if (key in props) continue;
        if (schema.additionalProperties === false) errors.push(`${path}: unexpected "${key}"`);
        else validate(schema.additionalProperties, value[key], `${path}.${key}`, errors);
        if (errors.length > 200) break;
      }
    }
  }
  return errors;
}
