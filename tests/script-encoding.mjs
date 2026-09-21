// PowerShell scripts that carry non-ASCII must say so in a byte order mark.
//
// From Rob's testing, 2026-09-21: the CrankMagic Online launcher dialog read
//
//   â—□ Checking CrankMagic Onlineâ€¦
//
// instead of "● Checking CrankMagic Online…". That is UTF-8 bytes shown as Windows-1252, and it
// happens because **Windows PowerShell 5.1 reads a .ps1 as the system ANSI codepage unless the
// file begins with a byte order mark.** The launcher had five distinct non-ASCII characters
// (● … ✕ ⚠ ✓) and no BOM, so every one of them was mojibake — he only saw the first because it is
// the first status the dialog shows.
//
// The BOM is the fix rather than stripping the glyphs, because ✓ ✕ ⚠ carry meaning at a glance in
// a launcher that is mostly status. But a BOM is invisible, and any editor that rewrites the file
// without one puts the mojibake straight back. So it is held here.
//
// PowerShell 7+ defaults to UTF-8 and does not need this; the launcher is double-clicked on
// Windows, which is 5.1.

import assert from "node:assert/strict";
import {readFileSync, readdirSync, statSync} from "node:fs";
import path from "node:path";

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; void label; };

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "..");

const scripts = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === ".claude") continue;
    const full = path.join(dir, name);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full);
    else if (name.toLowerCase().endsWith(".ps1")) scripts.push(full);
  }
};
walk(ROOT);

check("a PowerShell script with non-ASCII begins with a byte order mark", () => {
  const broken = [];
  for (const file of scripts) {
    const bytes = readFileSync(file);
    const hasBom = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
    const text = bytes.toString("utf8");
    const glyphs = [...new Set([...text].filter((ch) => ch.charCodeAt(0) > 127 && ch.charCodeAt(0) !== 0xFEFF))];
    if (glyphs.length && !hasBom) {
      broken.push(`${path.relative(ROOT, file)} carries ${glyphs.slice(0, 6).join(" ")} with no BOM`);
    }
  }
  assert.deepEqual(broken, [],
    "Windows PowerShell 5.1 reads these as the ANSI codepage, so every one of those characters reaches the screen as mojibake");
});

check("there are PowerShell scripts to check", () => {
  assert.ok(scripts.length > 0, "the walk found no .ps1 at all, so this suite is proving nothing");
});

console.log(`script-encoding: ${checks} checks passed — ${scripts.length} PowerShell scripts read`);
