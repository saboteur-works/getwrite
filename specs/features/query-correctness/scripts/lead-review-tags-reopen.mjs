// Feature 86 code-review follow-up (pipeline lead): does a saved Tags folder show its tag when reopened right after a reload?
// Review finding: saved chips are rebuilt before the builder has fetched the project's tags. Run OUTSIDE the sandbox.
import { withWeb, say, J, step, chips, setField, setOp, tick, setupData, queryHelpers } from "../../user-handbook/scripts/task5-qlib.mjs";

await withWeb("f86-review-tags", {}, async ({ h, page }) => {
  const P = "Q Test";
  await setupData(page, h, P);
  const { newQuery, saveAs } = queryHelpers(page, h);
  const valueBox = async () => {
    const slot = chips(page).nth(0).locator(".filter-chip__slot--value");
    return slot.locator("input").evaluateAll((els) => els.map((e) => ({ label: e.getAttribute("aria-label"), placeholder: e.getAttribute("placeholder"), value: e.value })))
      .then(async (inputs) => ({ inputs, text: (await slot.innerText()).slice(0, 120) }));
  };
  const editFolder = async (name) => {
    await page.locator(`text=${name}`).first().hover(); await tick(page, 400);
    await page.click(`button[aria-label='Edit ${name}']`); await tick(page, 1500);
  };
  await step("save", async () => {
    await newQuery(); await setField(page, 0, "Tags"); await setOp(page, 0, "includes");
    const inp = chips(page).nth(0).locator(".filter-chip__slot--value input").first();
    await inp.fill("flash"); await tick(page, 900);
    await page.locator("[role=option]:has-text('flashback')").first().click(); await tick(page, 600);
    say(`before save, value box: ${J(await valueBox())}`);
    await saveAs("Tag flashback");
  });
  await step("reopen without reload", async () => {
    await editFolder("Tag flashback");
    say(`reopen (no reload): ${J(await valueBox())}`);
    await page.keyboard.press("Escape"); await tick(page, 600);
  });
  await step("reopen right after reload", async () => {
    await page.reload(); await tick(page, 2000); await page.click(`button[aria-label="Open ${P}"]`); await tick(page, 2500);
    await editFolder("Tag flashback");
    say(`reopen (first builder open after reload): ${J(await valueBox())}`);
    await tick(page, 2000);
    say(`same chip 2 s later: ${J(await valueBox())}`);
  });
});
