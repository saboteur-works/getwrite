// Stage 6.5 (pipeline lead): spot-checks a few handbook statements against the web build. Run OUTSIDE the sandbox.
import { withWeb, createProject, bodyText, say, J } from "./task3-lib.mjs";

await withWeb("lead-exercise", {}, async ({ h, page }) => {
  await page.goto(h.baseUrl + "/");
  await page.waitForTimeout(1500);
  const start = await bodyText(page);
  say(`E1 start page empty: "No projects yet"=${start.includes("No projects yet")}; START A NEW PROJECT=${start.includes("START A NEW PROJECT")}`);

  await createProject(page, h, "Lead Check", "Novel");
  const opened = await bodyText(page);
  say(`E2 project opened: RESOURCES panel=${/RESOURCES/i.test(opened)}`);

  await page.locator("body").click({ position: { x: 700, y: 450 } }).catch(() => {});
  await page.keyboard.press("Meta+k");
  await page.waitForTimeout(500);
  const focused = await page.evaluate(() => {
    const a = document.activeElement;
    return a ? { tag: a.tagName, type: a.getAttribute("type"), placeholder: a.getAttribute("placeholder"), label: a.getAttribute("aria-label") } : null;
  });
  say(`E3 Cmd+K focused: ${J(focused)}`);
  await page.keyboard.press("Escape");

  const dataTab = page.locator("button:has-text('Data'), [role=tab]:has-text('Data')").first();
  await dataTab.click();
  await page.waitForTimeout(1200);
  const data = await bodyText(page);
  const note = "Text resources only, across the whole project. Not affected by the selected smart folder.";
  say(`E4 Data view: "By status"=${/By status/i.test(data)}; note text present=${data.includes(note)}`);
});
