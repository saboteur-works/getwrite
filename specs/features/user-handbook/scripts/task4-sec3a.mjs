// Task 4, web build: W-16 ("Today" is the local calendar day) and W-42 (file named by UTC date). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, pm, newProjectWithDoc, waitSaved, readLog, logFiles, openDoc } from "./task4-lib.mjs";
import path from "node:path";
await withWeb("t4sec3a", {}, async ({ h, page, browser }) => {
  say(`now: local ${new Date().toString()}; UTC ${new Date().toISOString()}`);
  await newProjectWithDoc(page, h, "Day Test", "Doc One");
  await pm(page).click();
  await page.keyboard.type("one two three four");
  say(`W-16 footer in the default context (system timezone) after saving: ${J(await waitSaved(page))}`);
  const log = readLog(h);
  say(`W-42 files in meta/writing-log: ${J(log.map((l) => l.file))}; UTC date now ${new Date().toISOString().slice(0, 10)}`);
  say(`W-27/W-43 day file content: ${J(log.map((l) => l.json))}`);
  const t0 = new Date(log[0].json.entries?.[0]?.timestamp ?? log[0].json[0]?.timestamp ?? Date.now());
  say(`entry timestamp T0 = ${t0.toISOString()}`);
  const nextDay = Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth(), t0.getUTCDate() + 1, 2, 0, 0);
  for (const tz of ["UTC", "Etc/GMT+12", "Etc/GMT-14"]) {
    const ctx = await browser.newContext({ timezoneId: tz, viewport: { width: 1400, height: 900 } });
    const p2 = await ctx.newPage();
    await p2.addInitScript((tc) => {
      const OFFSET = tc - Date.now();
      const D = Date;
      class FD extends D { constructor(...a) { if (a.length === 0) super(D.now() + OFFSET); else super(...a); } static now() { return D.now() + OFFSET; } }
      window.Date = FD;
    }, nextDay);
    await p2.goto(h.baseUrl + "/");
    await p2.waitForTimeout(1500);
    await p2.click('button[aria-label="Open Day Test"]');
    await p2.waitForTimeout(2500);
    await openDoc(p2, "Doc One");
    await p2.waitForTimeout(1500);
    const info = await p2.evaluate(() => ({ now: new Date().toISOString(), local: new Date().toString().slice(0, 33), tz: Intl.DateTimeFormat().resolvedOptions().timeZone }));
    say(`W-16 context tz=${tz}: browser clock set to ${info.now} (${info.local}); footer: ${J((await bodyText(p2)).split("\n").filter((l) => /^Today/.test(l)))}`);
    await ctx.close();
  }
});
