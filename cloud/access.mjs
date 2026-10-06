/* WHO IS ASKING. Cloudflare Access stands in front of /api/* and lets through only people Rob invited
 * (Rob, 2026-09-24: invite-only, Google sign-in). Every request it lets through carries a signed token in
 * Cf-Access-Jwt-Assertion, and the Worker checks it again rather than trusting that it was checked: the
 * signature against the team's published keys, the audience (this application and no other), the
 * issuer, the expiry, and that the token names a person. A misconfigured rule at the edge should fail
 * closed here, not open.
 *
 * Plain WebCrypto, no library: the Worker has none, and neither does the repository.
 */
const enc = new TextEncoder(), dec = new TextDecoder();
const bytes = (b64url) => {
  let s = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const json = (b64url) => JSON.parse(dec.decode(bytes(b64url)));

export class Unauthorized extends Error {
  constructor(why) {super(why); this.name = "Unauthorized";}
}

/* The team's signing keys, cached for ten minutes and refetched once when a token names a key the
   cache has not seen -- which is what a key rotation looks like from here. */
let cache = {url: "", at: 0, keys: new Map()};
export const forgetKeys = () => {cache = {url: "", at: 0, keys: new Map()};};
/* `published` is ACCESS_JWKS: the keys given directly, for the local end-to-end run only
   (tests/uat/cloud-e2e.mjs passes it to `wrangler dev`). tools/release-pages.mjs refuses any release
   whose configuration sets it, so a deployed Worker only ever trusts the keys its Access team publishes. */
async function keys(team, {fetchImpl = fetch, now = Date.now(), refresh = false, published = ""}) {
  const url = `https://${team}/cdn-cgi/access/certs`;
  if (!published && !refresh && cache.url === url && now - cache.at < 600_000) return cache.keys;
  let listed;
  if (published) listed = JSON.parse(published).keys;
  else {
    const response = await fetchImpl(url);
    if (!response.ok) throw new Unauthorized(`the Access signing keys did not load (${response.status})`);
    listed = (await response.json()).keys;
  }
  const found = new Map();
  for (const jwk of listed || []) {
    if (jwk.kty !== "RSA" || !jwk.kid) continue;
    found.set(jwk.kid, await crypto.subtle.importKey("jwk", {kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true},
      {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"}, false, ["verify"]));
  }
  if (!published) cache = {url, at: now, keys: found};
  return found;
}

/**
 * @returns {Promise<{email: string}>} the person the token names, lower-cased
 * @throws {Unauthorized} for anything short of a valid token for this application naming a person
 */
export async function verifyAccess(request, env, deps = {}) {
  /* `deps.audience` names another Access application on the same team: the AI door has its own (cloud/ai.mjs). */
  const team = env.ACCESS_TEAM_DOMAIN, audience = deps.audience || env.ACCESS_AUD;
  if (!team || !audience) throw new Error("ACCESS_TEAM_DOMAIN and ACCESS_AUD must be set; refusing every request until they are");
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new Unauthorized("no Access token");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Unauthorized("a malformed token");
  let header, claims;
  try {header = json(parts[0]); claims = json(parts[1]);} catch {throw new Unauthorized("a malformed token");}
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Unauthorized("an unexpected signing algorithm");
  const now = deps.now ?? Date.now();
  const published = env.ACCESS_JWKS || "";
  let key = (await keys(team, {...deps, now, published})).get(header.kid);
  if (!key && !published) key = (await keys(team, {...deps, now, refresh: true})).get(header.kid);
  if (!key) throw new Unauthorized("a key Access has not published");
  let signed = false;
  try {signed = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, bytes(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));} catch {}
  if (!signed) throw new Unauthorized("a bad signature");
  const seconds = Math.floor(now / 1000);
  if (!(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(audience)) throw new Unauthorized("a token for another application");
  if (claims.iss !== `https://${team}`) throw new Unauthorized("a token from another issuer");
  if (typeof claims.exp !== "number" || claims.exp < seconds - 30) throw new Unauthorized("an expired token");
  if (typeof claims.nbf === "number" && claims.nbf > seconds + 30) throw new Unauthorized("a token that is not valid yet");
  /* A service token has no email. Libraries belong to people, so a service token is not a person here -- except at a
     release that seats one (SERVICE_SEATS, the cloud-staging profile only: tools/release-pages.mjs refuses it anywhere
     else). There a token Access issued to a service token (its client id, `common_name`), checked like any other above,
     is one test identity: a session's automated checks of staging (the review response's L6), named so it is no one's
     address -- the Worker keys a person by what it is handed here, and nothing else reads it as mail. Only a service token
     Access admits reaches here: staging's "Session checks" policy. */
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!email && env.SERVICE_SEATS === "on" && typeof claims.common_name === "string" && claims.common_name.trim()) return {email: SERVICE_IDENTITY, service: true};
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new Unauthorized("a token that names no person");
  return {email};
}

/** Who a service token is, where a release seats one: the session's automated checks, never a person's address. */
export const SERVICE_IDENTITY = "service:session-checks";
