// Handbook re-run, group 1: discovery dump of the Project Type Manager form (web build). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText } from "./task3-lib.mjs";
const dump = async (page, tag) => {
  const ctl = await page.$$eval("[role=dialog] button, [role=dialog] input, [role=dialog] select, [role=dialog] textarea, [role=dialog] label, [role=alert], [role=status]", (e) =>
    e.map((x) => `${x.tagName}${x.type ? ":" + x.type : ""}${x.disabled ? ":DISABLED" : ""}|${x.getAttribute("aria-label") || ""}|${(x.textContent || x.value || x.placeholder || "").trim().slice(0, 60)}`));
  say(`${tag} controls ${J(ctl)}`);
  say(`${tag} text ${J((await bodyText(page)).split("\n").filter(Boolean).slice(-60))}`);
};
for (const savedTypes of [false, true]) {
  await withWeb("ptm", { copyTemplates: true, savedTypes }, async ({ h, page }) => {
    await page.goto(h.baseUrl + "/"); await page.waitForTimeout(1500);
    await page.click('button[aria-label="Open project settings menu"]');
    await page.click("text=Project Type Manager"); await page.waitForTimeout(1500);
    await dump(page, `savedTypes=${savedTypes} built-in Article`);
    await page.click("button:has-text('New Project Type')"); await page.waitForTimeout(800);
    await dump(page, `savedTypes=${savedTypes} new draft`);
  });
}
