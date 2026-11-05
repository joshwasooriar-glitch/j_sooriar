import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTES } from "@/lib/routes";

const ROOT = join(__dirname, "..");

function pageFile(href: string): string {
  return join(ROOT, "app", href === "/" ? "" : href, "page.tsx");
}

/** Every literal href="/..." in components and app, so a link to nowhere fails the build of trust. */
function literalHrefs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...literalHrefs(p));
    else if (p.endsWith(".tsx")) {
      for (const m of readFileSync(p, "utf8").matchAll(/href=["{`]+(\/[a-z/-]*)/g)) out.push(m[1]);
    }
  }
  return out;
}

describe("route registry", () => {
  it.each(ROUTES)("$href has a page that matches its milestone", (r) => {
    const file = pageFile(r.href);
    expect(existsSync(file), `${file} is missing`).toBe(true);
    const usesNotBuilt = readFileSync(file, "utf8").includes("<NotBuilt");
    expect(usesNotBuilt).toBe(r.milestone !== "built");
  });

  it("every unbuilt route explains itself", () => {
    for (const r of ROUTES.filter((x) => x.milestone !== "built")) expect(r.summary?.length ?? 0).toBeGreaterThan(20);
  });

  it("every literal link in the app points at a page", () => {
    const hrefs = new Set([...literalHrefs(join(ROOT, "components")), ...literalHrefs(join(ROOT, "app"))]);
    for (const h of hrefs) {
      const clean = h.replace(/\/$/, "") || "/";
      expect(existsSync(pageFile(clean)), `link to ${h} has no page`).toBe(true);
    }
  });
});
