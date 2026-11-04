// editor-position-memory, Task 3 / FR-11 check in the running app (web build: the built
// standalone server, throwaway projects dir, via the handbook harness). Run OUTSIDE the sandbox:
//   node specs/features/editor-position-memory/scripts/check-position.mjs > specs/features/editor-position-memory/logs/check-position.txt 2>&1
// Measures: which element scrolls, whether the editor is recreated on a switch, the cursor
// and scrollTop after switching documents and tabs, undo after a restore, saves after a restore,
// a first-time document, and a page reload.
import {
  withWeb,
  say,
  J,
  createProject,
  createNode,
  treeClick,
  tick,
  pm,
  clickTab,
  reloadProject,
} from "../../user-handbook/scripts/task6-lib.mjs";

const SENTENCE =
  "The rain kept on through the night and nobody in the house slept well. ";
const LONG_TEXT = SENTENCE.repeat(260);

const state = (page) =>
  page.evaluate(() => {
    const dom = document.querySelector(".ProseMirror");
    const editor = dom?.editor;
    const scroller = dom?.closest(".tiptap-editor-content");
    const sel = editor?.state.selection;
    return {
      editorMounted: !!dom,
      marker: dom ? dom.dataset.epmMarker || null : null,
      anchor: sel?.anchor ?? null,
      head: sel?.head ?? null,
      docSize: editor?.state.doc.content.size ?? null,
      scrollTop: scroller ? Math.round(scroller.scrollTop) : null,
      scrollHeight: scroller?.scrollHeight ?? null,
      clientHeight: scroller?.clientHeight ?? null,
      scrollerClass: scroller?.className ?? null,
      textLength: editor?.getText().length ?? null,
    };
  });
const mark = (page, v) =>
  page.evaluate((value) => {
    const d = document.querySelector(".ProseMirror");
    if (d) d.dataset.epmMarker = value;
  }, v);
const scrollers = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("*")]
      .filter((e) => {
        const c = getComputedStyle(e);
        return (
          /(auto|scroll)/.test(c.overflowY) &&
          e.scrollHeight > e.clientHeight + 1
        );
      })
      .map(
        (e) =>
          `${e.tagName.toLowerCase()}.${String(e.className).split(" ").slice(0, 3).join(".")} sh=${e.scrollHeight} ch=${e.clientHeight}`,
      ),
  );

await withWeb("epm-check", {}, async ({ h, page }) => {
  page.setDefaultTimeout(15000);
  const saves = [];
  page.on("request", (r) => {
    if (
      /\/api\/(resource|revision)/.test(r.url()) &&
      !["GET", "HEAD"].includes(r.method())
    )
      saves.push(
        `${Date.now()} ${r.method()} ${r.url().replace(h.baseUrl, "")}`,
      );
  });

  await createProject(page, h, "Pos", "Blank");
  await createNode(page, "Long", "text");
  await tick(page, 1500);
  await createNode(page, "Short", "text");
  await tick(page, 1500);
  await treeClick(page, "Long");
  await tick(page, 1500);
  await pm(page).click();
  await page.keyboard.insertText(LONG_TEXT);
  await tick(page, 6000);
  say("after typing Long: " + J(await state(page)));
  say("elements that scroll: " + J(await scrollers(page)));

  // OQ-1: scroll the wrapper and see which element's scrollTop changes.
  await page.evaluate(() => {
    document.querySelector(".tiptap-editor-content").scrollTop = 0;
  });
  await tick(page, 300);
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 900);
  await tick(page, 800);
  say(
    "OQ-1 after a mouse-wheel scroll of 900 over the editor: " +
      J(await state(page)),
  );

  // Place the cursor by clicking on visible text, then move it with the keyboard.
  const box = await pm(page).boundingBox();
  await page.mouse.click(box.x + 200, 450);
  await tick(page, 300);
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await tick(page, 800);
  const before = await state(page);
  say("Long, cursor placed and scrolled (before leaving): " + J(before));
  await mark(page, "first-editor");

  // Switch to another document and back.
  await treeClick(page, "Short");
  await tick(page, 2500);
  say("Short, first time this session: " + J(await state(page)));
  await treeClick(page, "Long");
  await tick(page, 2500);
  const backDoc = await state(page);
  say(
    "Long, back after switching documents: " +
      J(backDoc) +
      ` (same editor element: ${backDoc.marker === "first-editor"})`,
  );
  say(
    `RESULT document switch: cursor ${backDoc.anchor === before.anchor && backDoc.head === before.head ? "restored" : "NOT restored"}; scrollTop ${Math.abs((backDoc.scrollTop ?? -1) - before.scrollTop) <= 2 ? "restored" : "NOT restored"}`,
  );

  // Switch to another tab and back.
  await mark(page, "before-tab");
  await clickTab(page, "Data");
  await tick(page, 1500);
  await clickTab(page, "Edit");
  await tick(page, 2500);
  const backTab = await state(page);
  say(
    "Long, back after the Data tab: " +
      J(backTab) +
      ` (same editor element: ${backTab.marker === "before-tab"})`,
  );
  say(
    `RESULT tab switch: cursor ${backTab.anchor === before.anchor && backTab.head === before.head ? "restored" : "NOT restored"}; scrollTop ${Math.abs((backTab.scrollTop ?? -1) - before.scrollTop) <= 2 ? "restored" : "NOT restored"}`,
  );

  // Undo once after a restore, and saves after a restore.
  const savesBefore = saves.length;
  await tick(page, 4000);
  say(
    `saves in the 4s after returning (no edit made): ${saves.length - savesBefore} ${J(saves.slice(savesBefore))}`,
  );
  const lenBefore = (await state(page)).textLength;
  await page.evaluate(() =>
    document.querySelector(".ProseMirror").editor.commands.undo(),
  );
  await tick(page, 3000);
  say(
    `undo once after the restore: text length ${lenBefore} -> ${(await state(page)).textLength}`,
  );

  // A page reload starts with no records.
  await reloadProject(page, "Pos");
  await treeClick(page, "Long");
  await tick(page, 3000);
  say("Long after a page reload: " + J(await state(page)));
});
