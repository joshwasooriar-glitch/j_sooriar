/**
 * Goal status transitions, end to end. Clicks each button on /goals/[id] and
 * asserts the STORED row afterwards, not just that the action returned.
 * Regression for production digest 24741756 (status arrived as null).
 */

import { APP, expect, signedInPage, sql } from "./lib.mjs";

export default async function run(log) {
  const { browser, page } = await signedInPage("goalstatus");
  try {
    await page.goto(`${APP}/goals/new`);
    await page.fill("#title", "Status transitions");
    await page.click('form.form button[type="submit"]');
    await page.waitForURL(/\/goals\/[0-9a-f-]{36}$/);
    const id = page.url().split("/").pop();
    const stored = () => sql(`select status from goals where id = '${id}'`);
    expect(stored() === "active", "a new goal should start active");

    const steps = [
      ["Pause", "paused"],
      ["Reactivate", "active"],
      ["Mark completed", "completed"],
      ["Reactivate", "active"],
      ["Abandon", "abandoned"],
    ];
    for (const [label, want] of steps) {
      const before = stored();
      const res = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes(`/goals/${id}`));
      await page.click(`.status-actions button:has-text("${label}")`);
      const status = (await res).status();
      expect(status === 200, `"${label}" returned HTTP ${status}`);
      await page.waitForSelector(`.status-actions .status:has-text("${want.charAt(0).toUpperCase() + want.slice(1)}")`);
      const after = stored();
      log(`${label}: ${before} -> ${after} (HTTP ${status})`);
      expect(after === want, `"${label}" stored ${after}, expected ${want}`);
    }
  } finally {
    await browser.close();
  }
}
