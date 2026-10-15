// Task 6, web build: where the settings named on the view pages live (Project Settings tabs). Run OUTSIDE the sandbox.
import { withWeb, say, J, createProject, createNode, openSettings, closeSettings, dialogText } from "./task6-lib.mjs";
await withWeb("t6-s1", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  await createProject(page, h, "Set", "Blank");
  await createNode(page, "Doc", "text");
  for (const t of ["Metadata", "Entities", "Timeline", "Organizer"]) {
    await openSettings(page, t);
    const txt = (await dialogText(page)).split("Project Encryption").slice(-1)[0];
    say(`Project Settings, ${t} tab (active panel text): ` + J(txt.slice(0, 900)));
    await closeSettings(page);
  }
  await page.click('button[aria-label="Open project settings menu"]'); await page.locator("text=User Preferences").first().click(); await page.waitForTimeout(1200);
  say("User Preferences dialog: " + J(await page.evaluate(() => document.querySelector("[role=dialog], dialog").innerText)));
});
