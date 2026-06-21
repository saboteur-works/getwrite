import { test, expect, type Page } from "@playwright/test";

/**
 * LinkedIn demo walkthrough.
 *
 * Drives the live GetWrite app through a paced narrative and records it to
 * video (config: playwright.demo.config.ts). Run AFTER seeding the demo
 * project (node demo/seed.mjs):
 *
 *   pnpm --filter getwrite-frontend exec playwright test \
 *     --config ../demo/playwright.demo.config.ts
 *
 * Captions are injected as an on-screen banner so timing is baked into the
 * recording — no subtitle track to sync in post.
 */

const PROJECT = "The Lighthouse Keeper";

// ── Pacing ───────────────────────────────────────────────────────────────────
const BEAT = 450; // small breath between actions
const HOLD = 1800; // time a caption stays up to be read
const HOLD_LONG = 2400;

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

// ── On-screen caption banner ─────────────────────────────────────────────────
async function installCaptionLayer(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.getElementById("gw-cap-root")) return;
    const root = document.createElement("div");
    root.id = "gw-cap-root";
    root.innerHTML = `
      <style>
        #gw-cap-root{position:fixed;inset:0;pointer-events:none;z-index:2147483647;
          font-family:'IBM Plex Sans',ui-sans-serif,system-ui,sans-serif;}
        #gw-cap{position:absolute;left:50%;bottom:56px;transform:translateX(-50%) translateY(8px);
          max-width:760px;width:max-content;background:rgba(18,18,18,.93);
          color:#fff;padding:16px 22px;border-radius:14px;
          box-shadow:0 18px 50px rgba(0,0,0,.45);opacity:0;transition:opacity .4s ease,transform .4s ease;
          backdrop-filter:saturate(140%) blur(2px);}
        #gw-cap.show{opacity:1;transform:translateX(-50%) translateY(0);}
        #gw-cap .eyebrow{font-family:'IBM Plex Mono',ui-monospace,monospace;
          font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#9aa0a6;margin-bottom:6px;}
        #gw-cap .body{font-size:21px;line-height:1.4;font-weight:500;}
        #gw-cap .body b{font-weight:700;}
        /* Full-screen title card */
        #gw-card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
          justify-content:center;gap:18px;background:#0e0e0e;color:#fff;opacity:0;transition:opacity .5s ease;}
        #gw-card.show{opacity:1;}
        #gw-card .brand{font-size:64px;font-weight:700;letter-spacing:-.02em;}
        #gw-card .tag{font-size:22px;color:#cfd3d7;}
        #gw-card .meta{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:15px;color:#9aa0a6;margin-top:10px;}
      </style>
      <div id="gw-cap"><div class="eyebrow"></div><div class="body"></div></div>
      <div id="gw-card">
        <div class="brand">GetWrite</div>
        <div class="tag"></div>
        <div class="meta"></div>
      </div>`;
    document.body.appendChild(root);
  });
}

async function caption(
  page: Page,
  eyebrow: string,
  body: string,
): Promise<void> {
  await page.evaluate(
    ({ eyebrow, body }) => {
      const cap = document.getElementById("gw-cap");
      if (!cap) return;
      (cap.querySelector(".eyebrow") as HTMLElement).textContent = eyebrow;
      (cap.querySelector(".body") as HTMLElement).innerHTML = body;
      cap.classList.add("show");
    },
    { eyebrow, body },
  );
}

async function clearCaption(page: Page): Promise<void> {
  await page.evaluate(() =>
    document.getElementById("gw-cap")?.classList.remove("show"),
  );
}

async function titleCard(page: Page, tag: string, meta: string): Promise<void> {
  await page.evaluate(
    ({ tag, meta }) => {
      const card = document.getElementById("gw-card");
      if (!card) return;
      (card.querySelector(".tag") as HTMLElement).textContent = tag;
      (card.querySelector(".meta") as HTMLElement).textContent = meta;
      card.classList.add("show");
    },
    { tag, meta },
  );
}

// ── Tree helper: click the expand chevron next to a folder row ───────────────
async function expandFolder(page: Page, name: string): Promise<void> {
  const item = page.getByRole("treeitem", { name, exact: true });
  await item.scrollIntoViewIfNeeded();
  // The chevron is a sibling button inside the row's parent container.
  const chevron = item.locator("xpath=..").getByRole("button").first();
  await chevron.click();
  await pause(page, BEAT);
}

test("getwrite demo walkthrough", async ({ page }) => {
  // ── 1. Start page ──────────────────────────────────────────────────────────
  await page.goto("/");
  await installCaptionLayer(page);
  await expect(
    page.getByRole("heading", { name: "GetWrite", level: 1 }),
  ).toBeVisible();
  await pause(page, 900);
  await caption(
    page,
    "Local-first writing studio",
    "A writing workspace where your work stays as <b>plain files on your disk.</b>",
  );
  await pause(page, HOLD_LONG);
  await clearCaption(page);
  await pause(page, BEAT);

  // ── 2. Open the project ──────────────────────────────────────────────────────
  await caption(
    page,
    "No database",
    "Every project, document, and note is just <b>JSON and folders.</b>",
  );
  await pause(page, HOLD);
  await page.getByRole("button", { name: `Open ${PROJECT}` }).click();
  await expect(page.getByRole("tab", { name: "Edit" })).toBeVisible();
  await installCaptionLayer(page); // re-install after view swap
  await pause(page, HOLD);
  await clearCaption(page);

  // ── 3. Open a chapter — the editor ───────────────────────────────────────────
  await expandFolder(page, "Workspace");
  await expandFolder(page, "Chapters");
  await page
    .getByRole("treeitem", { name: "Chapter One — The Light", exact: true })
    .click();
  const editor = page.locator(".tiptap.ProseMirror");
  await expect(
    editor.getByRole("heading", { name: "Chapter One — The Light" }),
  ).toBeVisible();
  await pause(page, BEAT);
  await caption(
    page,
    "The editor",
    "A focused writing surface built on <b>TipTap</b> — serif body, generous line height.",
  );
  await pause(page, HOLD_LONG);
  await clearCaption(page);

  // ── 4. Live typing → autosave ────────────────────────────────────────────────
  // This mutates Chapter One (and its canonical revision), so always record on a
  // freshly seeded project — see demo/README.md.
  await caption(
    page,
    "Autosave",
    "Type, and it persists to the <b>canonical revision</b> on disk.",
  );
  try {
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(
      "  The fog took the horizon first, then the sound.",
      { delay: 38 },
    );
  } catch {
    /* keep the video rolling even if focus is finicky */
  }
  await pause(page, HOLD);
  await clearCaption(page);

  // ── 5. Structured metadata (incl. custom fields) ─────────────────────────────
  // Open a chapter whose sidecar carries built-in + custom fields; the metadata
  // sidebar on the right shows Status, POV, and the custom Arc / Tension fields.
  await page
    .getByRole("treeitem", {
      name: "Chapter Two — Salt and Static",
      exact: true,
    })
    .click();
  await expect(
    page
      .locator(".tiptap.ProseMirror")
      .getByRole("heading", { name: "Chapter Two — Salt and Static" }),
  ).toBeVisible();
  await pause(page, BEAT);
  await caption(
    page,
    "Structured metadata",
    "Every document carries fields you define — status, POV, and custom ones like <b>Arc &amp; Tension.</b>",
  );
  await pause(page, HOLD_LONG);
  await clearCaption(page);

  // ── 6. Wiki-links + backlinks ────────────────────────────────────────────────
  await expandFolder(page, "Story Elements");
  await expandFolder(page, "Characters");
  await page.getByRole("treeitem", { name: "Mara Vance", exact: true }).click();
  await expect(
    page
      .locator(".tiptap.ProseMirror")
      .getByRole("heading", { name: "Mara Vance" }),
  ).toBeVisible();
  await pause(page, BEAT);
  await caption(
    page,
    "Linked thinking",
    "Documents connect with <b>[[wiki-links]]</b> — backlinks are indexed automatically.",
  );
  await pause(page, HOLD_LONG);
  await clearCaption(page);

  // ── 7. Full-text search ──────────────────────────────────────────────────────
  await caption(
    page,
    "Search",
    "Full-text search over a <b>custom inverted index.</b>",
  );
  const search = page.getByRole("textbox", { name: "resource-search" });
  await search.click();
  await search.type("keeper", { delay: 65 });
  await pause(page, HOLD_LONG);
  await search.fill("");
  await page.keyboard.press("Escape");
  await clearCaption(page);

  // ── 8. Query it like a database ──────────────────────────────────────────────
  // Opening a saved query renders its full structure (chips + AND/OR), a live
  // match count, and the filtered results in the Data view.
  await caption(
    page,
    "Smart folders",
    "Saved queries become folders — combine any fields with <b>AND / OR.</b>",
  );
  await page
    .getByRole("button", { name: "High-Tension Scenes", exact: true })
    .click();
  await expect(page.getByText("2 matches", { exact: false })).toBeVisible();
  await pause(page, HOLD_LONG);
  await clearCaption(page);
  await caption(
    page,
    "No database",
    "Structured queries across your whole project — with <b>no database at all.</b>",
  );
  await pause(page, HOLD_LONG);
  await clearCaption(page);
  await pause(page, BEAT);

  // ── 10. End card ─────────────────────────────────────────────────────────────
  await titleCard(
    page,
    "Built end-to-end — web · desktop · CLI",
    "github.com/saboteur-works/getwrite",
  );
  await pause(page, 3400);
});
