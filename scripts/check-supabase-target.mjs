#!/usr/bin/env node
// Release guard (audit F-05): fail unless config.toml, client URL and the embedded anon key all point at the
// Supabase project the operator says they are releasing to. Offline; reads files only; prints no secrets.
import { readFileSync } from "node:fs";

const expected = process.env.EXPECTED_SUPABASE_REF;
if (!expected) {
  console.error("EXPECTED_SUPABASE_REF is required (the 20-char project ref you intend to release to).");
  process.exit(2);
}
const toml = readFileSync("supabase/config.toml", "utf8");
const client = readFileSync("src/integrations/supabase/client.ts", "utf8");
const cfgRef = /project_id\s*=\s*"([a-z0-9]+)"/.exec(toml)?.[1];
const urlRef = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(client)?.[1];
const jwt = /SUPABASE_PUBLISHABLE_KEY\s*=\s*"([^"]+)"/.exec(client)?.[1];
let keyRef, keyRole;
try {
  const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
  keyRef = payload.ref; keyRole = payload.role;
} catch { /* reported below */ }

const problems = [];
if (cfgRef !== expected) problems.push(`supabase/config.toml project_id (${cfgRef}) != expected (${expected})`);
if (urlRef !== expected) problems.push(`client.ts URL ref (${urlRef}) != expected (${expected})`);
if (keyRef !== expected) problems.push(`publishable key ref (${keyRef}) != expected (${expected})`);
if (keyRole !== "anon") problems.push(`publishable key role is "${keyRole}", must be "anon"`);
if (problems.length) { console.error("Supabase target check FAILED:\n- " + problems.join("\n- ")); process.exit(1); }
console.log(`Supabase target check OK: config, URL and key all reference ${expected}`);
