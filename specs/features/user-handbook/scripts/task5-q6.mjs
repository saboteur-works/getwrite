// Task 5, web build: check whether a metadata change after typing leaves the stored word count at 0 (seen once while building the query data). Run OUTSIDE the sandbox.
import { withWeb, say, J, newProjectWithDoc, createNode, treeClick, sidecarByName, pm, tick, typeInto, sidebarText } from "./task5-qlib.mjs";
await withWeb("t5-q6", {}, async ({ h, page }) => {
  page.setDefaultTimeout(10000);
  await newProjectWithDoc(page, h, "WC Test", "Scene A");
  await createNode(page, "Scene B", "text");
  for (const [name, text] of [["Scene A", "one two three four five six seven eight nine ten"], ["Scene B", "alpha beta gamma delta epsilon"]]) {
    await treeClick(page, name);
    await typeInto(page, text);
    say(`${name} after typing and waiting 6 s: wordCount=${sidecarByName(h, name).json.wordCount}; footer=${J((await (await import("./task5-lib.mjs")).bodyText(page)).split("\n").filter((l) => /^Words:/.test(l)))}`);
    await page.selectOption("select[aria-label=status]", { label: "Draft" }); await tick(page, 2500);
    say(`${name} after then choosing a Status: wordCount=${sidecarByName(h, name).json.wordCount}; userMetadata=${J(sidecarByName(h, name).json.userMetadata)}; footer=${J((await (await import("./task5-lib.mjs")).bodyText(page)).split("\n").filter((l) => /^Words:/.test(l)))}`);
  }
  await treeClick(page, "Scene B"); await treeClick(page, "Scene A");
  say(`after reselecting Scene A: wordCount=${sidecarByName(h, "Scene A").json.wordCount}`);
});
