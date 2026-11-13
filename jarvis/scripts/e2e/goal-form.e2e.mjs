/**
 * A goal form that fails validation keeps what was typed and shows each error
 * against its own field. Regression for the Nov 11 acceptance run, where every
 * field cleared on a validation error.
 */

import { APP, expect, signedInPage, sql } from "./lib.mjs";

const TYPED = {
  title: "Keep what I typed",
  new_domain: "Fitness",
  target_value: "12",
  unit: "",
  start_date: "2026-11-20",
  target_date: "2026-11-10", // before the start: an error
  priority: "2",
  success_definition: "Twelve sessions logged",
  description: "Notes that must survive",
};

export default async function run(log) {
  const { browser, page, user } = await signedInPage("goalform");
  try {
    await page.goto(`${APP}/goals/new`);
    await page.fill("#title", TYPED.title);
    await page.fill("#new_domain", TYPED.new_domain);
    await page.selectOption("#metric_type", "count");
    await page.fill("#target_value", TYPED.target_value);
    await page.fill("#unit", TYPED.unit); // missing: an error for count goals
    await page.fill("#start_date", TYPED.start_date);
    await page.fill("#target_date", TYPED.target_date);
    await page.selectOption("#priority", TYPED.priority);
    await page.fill("#success_definition", TYPED.success_definition);
    await page.fill("#description", TYPED.description);

    await page.click('form.form button[type="submit"]');
    await page.waitForSelector(".fld-error");
    await page.waitForFunction(() => !document.querySelector("form.form fieldset")?.disabled);

    const errorFor = async (name) =>
      page.locator(`.fld:has(#${name}) .fld-error`).textContent({ timeout: 1000 }).catch(() => null);
    const unitErr = await errorFor("unit");
    const dateErr = await errorFor("target_date");
    const titleErr = await errorFor("title");
    log(`unit error: ${unitErr}`);
    log(`target_date error: ${dateErr}`);
    expect(unitErr && /unit/i.test(unitErr), `no error shown against Unit (got ${unitErr})`);
    expect(dateErr && /before the start/i.test(dateErr), `no error shown against Deadline (got ${dateErr})`);
    expect(titleErr === null, `an error was shown against Title, which was valid (${titleErr})`);
    expect((await page.inputValue("#metric_type")) === "count", "metric reset");
    for (const [name, want] of Object.entries(TYPED)) {
      const got = await page.inputValue(`#${name}`);
      log(`${name}: ${JSON.stringify(got)}`);
      expect(got === want, `#${name} was ${JSON.stringify(got)} after the error, expected ${JSON.stringify(want)}`);
    }

    for (const name of ["unit", "target_date"]) {
      const invalid = await page.getAttribute(`#${name}`, "aria-invalid");
      expect(invalid === "true", `#${name} is not marked aria-invalid`);
      const describedBy = await page.getAttribute(`#${name}`, "aria-describedby");
      expect(describedBy === `${name}-error`, `#${name} is not described by its error (${describedBy})`);
    }

    const stored = sql(`select count(*) from goals where user_id = '${user.id}'`);
    expect(stored === "0", `an invalid goal was stored (${stored} rows)`);

    // Fix only the two bad fields; everything else is still what was typed.
    await page.fill("#unit", "sessions");
    await page.fill("#target_date", "2026-12-31");
    await page.click('form.form button[type="submit"]');
    await page.waitForURL(/\/goals\/[0-9a-f-]{36}$/);
    const row = sql(
      `select concat_ws('|', title, metric_type, target_value::int, unit, start_date, target_date, priority, success_definition, description) from goals where user_id = '${user.id}'`,
    );
    log(`stored after the fix: ${row}`);
    expect(
      row === "Keep what I typed|count|12|sessions|2026-11-20|2026-12-31|2|Twelve sessions logged|Notes that must survive",
      `the corrected goal was stored as ${row}`,
    );
  } finally {
    await browser.close();
  }
}
