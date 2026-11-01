// Handbook re-run, group 1 (OQ-8), web build: the New resource dialog's fields and type options. Run OUTSIDE the sandbox.
import { withWeb, say, J, createProject } from "./task3-lib.mjs";
await withWeb("g1-dialog", {}, async ({ h, page }) => {
  await createProject(page, h, "Dialog Test", "Blank");
  for (const [tag, open] of [["Create Resource button", () => page.locator('button[aria-label="Create Resource"]').last().click({ force: true })], ["Workspace options > Create", async () => { await page.click('button[aria-label="Workspace options"]'); await page.click(".resource-context-menu-item:has-text('Create')"); }]]) {
    try {
      await open(); await page.waitForTimeout(800);
      say(`${tag}: dialog ${J(await page.$$eval("[role=dialog]", (d) => d.map((x) => x.innerText.split("\n").filter(Boolean))))}; selects ${J(await page.$$eval("[role=dialog] select", (s) => s.map((x) => [...x.options].map((o) => o.textContent.trim()))))}`);
      await page.keyboard.press("Escape"); await page.waitForTimeout(400);
    } catch (e) { say(`${tag} STEP ERROR ${String(e.message).split("\n")[0]}`); }
  }
});
