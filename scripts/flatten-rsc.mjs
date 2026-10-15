// Runs after every build (npm run build → postbuild).
//
// The static export writes the navigation data of nested pages into folders,
// e.g. out/admin/inventory/__next.admin/inventory/__PAGE__.txt, but the browser
// asks for one flat file: out/admin/inventory/__next.admin.inventory.__PAGE__.txt.
// On a static host (GitHub Pages) that request 404s and every in-site link
// falls back to a full page load. This copies each such file to the flat name.

import fs from "node:fs";
import path from "node:path";

const OUT = "out";
let copied = 0;

function flatten(dir, prefix, into) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = `${prefix}.${e.name}`;
    if (e.isDirectory()) flatten(path.join(dir, e.name), name, into);
    else {
      const target = path.join(into, name);
      if (!fs.existsSync(target)) {
        fs.copyFileSync(path.join(dir, e.name), target);
        copied++;
      }
    }
  }
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const full = path.join(dir, e.name);
    if (e.name.startsWith("__next.")) flatten(full, e.name, dir);
    else walk(full);
  }
}

if (!fs.existsSync(OUT)) throw new Error("out/ not found: run next build first");
walk(OUT);
console.log(`flatten-rsc: ${copied} navigation file(s) copied to their flat names`);
