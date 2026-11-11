#!/usr/bin/env node
/** Runs every scripts/e2e/*.e2e.mjs (or the ones named) and exits 1 on any failure. */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".e2e.mjs"))
  .filter((f) => only.length === 0 || only.some((o) => f.includes(o)))
  .sort();

let failed = 0;
for (const f of files) {
  const started = Date.now();
  try {
    const mod = await import(pathToFileURL(join(dir, f)).href);
    await mod.default((m) => console.log(`   ${m}`));
    console.log(`PASS ${f} (${Date.now() - started} ms)`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${f}: ${err.message}`);
  }
}
console.log(failed ? `\n${failed} of ${files.length} e2e files failed` : `\nall ${files.length} e2e files passed`);
process.exit(failed ? 1 : 0);
