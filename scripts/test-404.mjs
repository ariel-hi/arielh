// Exercise the production page generator without rebuilding workspace artifacts.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const unchangedPages = ["projects.html", "about.html", "privacy.html"];
const originals = new Map(unchangedPages.map((name) => [name, fs.readFileSync(path.join(root, name))]));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arielh-404-tests-"));

try {
  fs.mkdirSync(path.join(temporary, "scripts"));
  fs.copyFileSync(path.join(root, "scripts/build-pages.js"), path.join(temporary, "scripts/build-pages.js"));
  fs.copyFileSync(path.join(root, "projects-data.js"), path.join(temporary, "projects-data.js"));
  fs.mkdirSync(path.join(temporary, "grid16"));
  for (const name of ["scripts/seo.js", "scripts/journey-runtime.js", "index.html", "grid16/index.html", "shooter.html", "horizon.html", "nebula.html", "kinetic.html", "rufus.html"]) {
    fs.copyFileSync(path.join(root, name), path.join(temporary, name));
  }
  execFileSync(process.execPath, [path.join(temporary, "scripts/build-pages.js")], { cwd: temporary });

  for (const [name, original] of originals) {
    assert.deepEqual(fs.readFileSync(path.join(temporary, name)), original, `${name} output changed`);
    assert.deepEqual(fs.readFileSync(path.join(root, name)), original, `${name} workspace file changed`);
  }

  const document = fs.readFileSync(path.join(temporary, "404.html"), "utf8");
  assert.equal(document, fs.readFileSync(path.join(root, "404.html"), "utf8"), "404 output is not current");
  assert.doesNotMatch(document, /<base\b/i, "A base tag would move the skip-link target");
  assert.match(document, /href="#main"/);
  assert.match(document, /id="main"/);
  assert.match(document, /href="\/#projects"/);

  const references = [...document.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  const expectedLocal = ["/favicon.svg?v=20261002y", "/site.css?v=20261002y", "/site.js?v=20261002b",
    "/analytics/analytics.js?v=20261002k", "/", "/projects.html", "/about.html", "/privacy.html"];
  for (const reference of expectedLocal) assert.ok(references.includes(reference), `Missing ${reference}`);

  for (const missing of ["https://arielh.com/missing/deep/page?view=1", "https://arielh.com/missing/deep/"]) {
    const address = new URL(missing);
    for (const reference of references) {
      const resolved = new URL(reference, address);
      if (reference.startsWith("#")) {
        assert.equal(resolved.pathname, address.pathname, "Skip link left the missing page");
        assert.equal(resolved.search, address.search);
        assert.equal(resolved.hash, "#main");
      } else if (resolved.origin === address.origin && !reference.startsWith("https://")) {
        assert.ok(reference.startsWith("/"), `Nested recovery URL: ${reference}`);
        const target = path.join(root, resolved.pathname === "/" ? "index.html" : resolved.pathname.slice(1));
        assert.ok(fs.statSync(target).isFile(), `Recovery URL does not resolve to a site file: ${resolved.href}`);
        assert.ok(!resolved.pathname.startsWith("/missing/"));
      }
    }
  }
  console.log("PASS: generated 404 assets/recovery links resolve at deep missing URLs; fragments/external links and other pages are unchanged.");
} finally {
  assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()), "Unexpected temporary root");
  assert.ok(path.basename(temporary).startsWith("arielh-404-tests-"));
  fs.rmSync(temporary, { recursive: true, force: true });
}
