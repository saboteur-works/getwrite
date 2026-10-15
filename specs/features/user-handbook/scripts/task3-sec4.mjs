// Task 3, web build: App Settings rows S-14..S-16. Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, createProject, closeProject } from "./task3-lib.mjs";
const step = async (id, fn) => { try { await fn(); } catch (e) { say(`${id} STEP ERROR ${String(e.message).split("\n").slice(0, 3).join(" | ")}`); } };
await withWeb("web", {}, async ({ h, page }) => {
  const obs = async () => (await bodyText(page)).split("\n").filter((l) => /also reads as a common English word/.test(l));
  const openEntity = async () => {
    await page.click("text=Quillfeather >> nth=0");
    await page.waitForTimeout(1500);
  };
  const enableEntities = async () => {
    await page.click('button[aria-label="Open project settings menu"]');
    await page.click("text=Project Settings");
    await page.waitForTimeout(800);
    await page.locator("[role=dialog] [role=tab]:has-text('Entities')").click();
    await page.waitForTimeout(500);
    const cb = page.locator("[role=dialog] input[type=checkbox]").last();
    const before = await cb.isChecked();
    if (!before) await cb.click({ force: true });
    await page.waitForTimeout(800);
    say(`entities checkbox before=${before} after=${await cb.isChecked()}`);
    await page.click("[role=dialog] button:has-text('Close')");
    await page.waitForTimeout(500);
  };
  await step("S-14", async () => {
    await page.goto(h.baseUrl + "/");
    await page.waitForTimeout(1500);
    await page.click('button[aria-label="App Settings"]');
    await page.waitForTimeout(600);
    say(`S-14 App Settings dialog (opened at ${new URL(page.url()).pathname}, no login screen): ${J((await bodyText(page)).split("\n").filter(Boolean).slice(-8))}`);
    say(`S-14 dialog controls: ${J(await page.$$eval("[role=dialog] button, [role=dialog] input, dialog button, dialog input", (e) => e.map((x) => x.tagName + ":" + (x.getAttribute("aria-label") || x.placeholder || x.textContent || "").trim())))}`);
    await page.click("button:has-text('CLOSE'), button:has-text('Close')");
  });
  await step("S-15 control", async () => {
    await createProject(page, h, "Ent", "Blank");
    await page.click("button:has-text('CREATE RESOURCE')");
    await page.locator("[role=dialog] input[type=text], dialog input[type=text]").first().fill("Quillfeather");
    await page.locator("[role=dialog] button:has-text('Create'), dialog button:has-text('Create')").last().click();
    await page.waitForTimeout(2500);
    await enableEntities();
    await openEntity();
    const ek = page.locator('input[placeholder*="ind" i], input[aria-label*="kind" i]').first();
    await ek.fill("character"); await ek.press("Enter"); await ek.blur();
    await page.waitForTimeout(2000);
    say(`S-15 control, entity "Quillfeather" with no global word set: observation lines ${J(await obs())}`);
    await closeProject(page);
  });
  await step("S-15 add global word", async () => {
    await page.click('button[aria-label="App Settings"]');
    await page.waitForTimeout(500);
    await page.locator("[role=dialog] input[type=text], dialog input[type=text]").first().fill("quillfeather");
    await page.click("button:has-text('ADD'), button:has-text('Add')");
    await page.waitForTimeout(800);
    say(`S-15 App Settings list after add: ${J((await bodyText(page)).split("\n").filter(Boolean).slice(-6))}`);
    await page.click("button:has-text('CLOSE'), button:has-text('Close')");
    await page.reload(); await page.waitForTimeout(2000);
    await page.click('button[aria-label="App Settings"]');
    await page.waitForTimeout(600);
    say(`S-15 App Settings list after reload: ${J((await bodyText(page)).split("\n").filter(Boolean).slice(-5))}`);
    await page.click("button:has-text('CLOSE'), button:has-text('Close')");
    await page.click('button[aria-label="Open Ent"]');
    await page.waitForTimeout(2000);
    await openEntity();
    say(`S-15 after adding global word quillfeather, same entity: observation lines ${J(await obs())}`);
    await page.click('button[aria-label="Open project settings menu"]');
    await page.click("text=Project Settings");
    await page.waitForTimeout(800);
    await page.locator("[role=dialog] [role=tab]:has-text('Noise Words')").click();
    await page.waitForTimeout(600);
    say(`S-15 project Noise Words tab: ${J((await bodyText(page)).split("\n").filter(Boolean).slice(-14))}`);
  });
});
