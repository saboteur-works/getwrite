// Task 3, web build: Start Page rows S-01..S-09, S-14..S-16 (web part). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, createProject, closeProject, newLines } from "./task3-lib.mjs";
import { readdirSync, readFileSync, existsSync } from "node:fs";
const step = async (id, fn) => { try { await fn(); } catch (e) { say(`${id} STEP ERROR ${String(e.message).split("\n")[0]}`); } };
await withWeb("web", {}, async ({ h, page }) => {
  await step("S-01", async () => {
    await page.goto(h.baseUrl + "/");
    await page.waitForTimeout(2000);
    say(`S-01 first page at ${new URL(page.url()).pathname}: ${J((await bodyText(page)).split("\n").filter(Boolean).slice(0, 12))}`);
    say(`S-10..13 web buttons: ${J(await page.$$eval("button,a", (e) => e.map((x) => (x.getAttribute("aria-label") || x.textContent || "").trim()).filter(Boolean)))}`);
  });
  await step("S-02", async () => {
    await createProject(page, h, "Alpha Novel", "Novel");
    say(`S-05 after Create: url path ${new URL(page.url()).pathname}; header shows project: ${J((await bodyText(page)).split("\n").filter(Boolean).slice(0, 4))}`);
    await closeProject(page);
    await createProject(page, h, "Beta Blank", "Blank");
    await closeProject(page);
    const lines = (await bodyText(page)).split("\n").filter(Boolean);
    say(`S-02/03 start page with 2 projects: ${J(lines)}`);
  });
  await step("S-06", async () => {
    await page.click('button[aria-label="Open Beta Blank"]');
    await page.waitForTimeout(2000);
    say(`S-06 after Open: header ${J((await bodyText(page)).split("\n").filter(Boolean).slice(0, 6))}`);
    await closeProject(page);
  });
  await step("S-07", async () => {
    await page.click('button[aria-label="Manage Beta Blank"]');
    await page.click("text=Rename");
    await page.waitForTimeout(500);
    await page.fill('input[value="Beta Blank"]', "Gamma Renamed");
    await page.click("button:has-text('Save')");
    await page.waitForTimeout(1500);
    const lines = (await bodyText(page)).split("\n").filter(Boolean);
    say(`S-07 after rename: names on page ${J(lines.filter((l) => /Beta|Gamma|Alpha/.test(l)))}`);
    await page.reload();
    await page.waitForTimeout(1500);
    say(`S-07 after reload: ${J((await bodyText(page)).split("\n").filter((l) => /Beta|Gamma|Alpha/.test(l)))}`);
    const dirs = readdirSync(h.projectsDir);
    const names = dirs.map((d) => { try { return JSON.parse(readFileSync(`${h.projectsDir}/${d}/project.json`, "utf8")).name; } catch { return "?"; } });
    say(`S-07 throwaway projects dir project.json names: ${J(names)}`);
  });
  await step("S-09", async () => {
    const mk = async (title, viaTree) => {
      if (viaTree) {
        await page.click('button[aria-label="Workspace options"]');
        await page.click(".resource-context-menu-item:has-text('Create')");
      } else await page.click("button:has-text('CREATE RESOURCE')");
      await page.locator("[role=dialog] input[type=text], dialog input[type=text]").first().fill(title);
      await page.locator("[role=dialog] button:has-text('Create'), dialog button:has-text('Create')").last().click();
      await page.waitForTimeout(2500);
    };
    await page.click('button[aria-label="Open Gamma Renamed"]');
    await page.waitForTimeout(2000);
    await mk("Root Doc", false);
    await mk("Compile Doc", true);
    await page.click("text=Compile Doc >> nth=0");
    await page.waitForTimeout(1500);
    await page.locator(".ProseMirror").first().click();
    await page.keyboard.type("Hello compile world.");
    await page.waitForTimeout(4000);
    say(`S-09 editor footer: ${J((await bodyText(page)).split("\n").filter((l) => /saved|Words/i.test(l)))}`);
    await page.click('button[aria-label="Open project menu"]');
    await page.click("text=Compile Project");
    await page.waitForTimeout(800);
    say(`S-09 in-project Compile Project dialog list: ${J((await bodyText(page)).split("\n").filter(Boolean).slice(-14))}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await closeProject(page);
    await page.reload();
    await page.waitForTimeout(2000);
    await page.click('button[aria-label="Manage Gamma Renamed"]');
    await page.click("text=Package");
    await page.waitForTimeout(800);
    say(`S-09 Start Page Package dialog list: ${J((await bodyText(page)).split("\n").filter(Boolean).slice(-14))}`);
    await page.click("button:has-text('SELECT ALL')");
    await page.waitForTimeout(300);
    await page.click("button:text-is('md'), label:has-text('md')").catch(() => {});
    say(`S-09 after Select all: ${J((await bodyText(page)).split("\n").filter(Boolean).slice(-8))}`);
    const dl = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
    await page.click("button:has-text('COMPILE (')");
    const d = await dl;
    if (d) {
      const p = await d.path();
      say(`S-09 download: ${d.suggestedFilename()} bytes=${readFileSync(p).length}; content=${J(readFileSync(p, "utf8").slice(0, 300))}`);
    } else say(`S-09 no download event; page: ${J((await bodyText(page)).split("\n").filter(Boolean).slice(-8))}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  });
  await step("S-08", async () => {
    await page.goto(h.baseUrl + "/");
    await page.waitForTimeout(1500);
    const before = readdirSync(h.projectsDir).length;
    await page.click('button[aria-label="Manage Alpha Novel"]');
    await page.click("text=Delete");
    await page.waitForTimeout(500);
    say(`S-08 confirm dialog: ${J((await bodyText(page)).split("\n").filter((l) => /Delete project|permanently|Are you/.test(l)))}`);
    await page.locator("button:has-text('Delete')").last().click();
    await page.waitForTimeout(2000);
    say(`S-08 after delete, before reload (2 s): projects on page ${J((await bodyText(page)).split("\n").filter((l) => /^(Alpha|Gamma)/.test(l)))}; dirs now ${readdirSync(h.projectsDir).length}`);
    await page.reload();
    await page.waitForTimeout(1500);
    say(`S-08 after delete and reload: projects on page ${J((await bodyText(page)).split("\n").filter((l) => /Alpha|Gamma/.test(l)))}; dirs before=${before} after=${readdirSync(h.projectsDir).length}`);
  });
});
