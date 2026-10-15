// Shared helpers for the Task 6 runs (web build, Playwright). Builds on task5-lib.mjs.
export * from "./task5-lib.mjs";
import { bodyText, say, J, pm, createNode, treeClick, sidebarText, openSettings, closeSettings, dialogText, sidecars } from "./task5-lib.mjs";
export const tabs = (page) => page.evaluate(() => [...document.querySelectorAll("[role=tab]")].map((t) => ({ text: t.innerText.trim(), disabled: t.disabled || t.getAttribute("aria-disabled") === "true", selected: t.getAttribute("aria-selected"), title: t.getAttribute("title") })));
export const clickTab = async (page, name) => { await page.locator(`[role=tab]:has-text("${name}")`).first().click(); await page.waitForTimeout(1200); };
export const dumpButtons = (page) => page.evaluate(() => [...document.querySelectorAll("button,[role=button],select,input")].map((b) => `${b.tagName.toLowerCase()}|${b.getAttribute("aria-label") || ""}|${(b.innerText || b.value || "").trim().slice(0, 40)}|${b.disabled ? "disabled" : ""}`).filter((s) => s.length > 10));
export async function typeInto(page, title, text) {
  await treeClick(page, title);
  await pm(page).click();
  await page.keyboard.insertText(text);
  await page.waitForTimeout(4500);
}
export async function reloadProject(page, name) {
  await page.reload(); await page.waitForTimeout(2000);
  await page.click(`button[aria-label="Open ${name}"]`); await page.waitForTimeout(2000);
  await expandAll(page);
}
import { expandAll } from "./task5-lib.mjs";
export const cards = (page) => page.evaluate(() => [...document.querySelectorAll("[aria-labelledby^='res-']")].map((c) => ({ title: (c.querySelector("h3")?.innerText || c.innerText.split("\n")[0]), text: c.innerText.replace(/\n+/g, " | ").slice(0, 200), img: [...c.querySelectorAll("img")].map((i) => ({ w: i.naturalWidth })), audio: [...c.querySelectorAll("audio")].map((a) => ({ controls: a.controls })) })));
export const tick = (page, ms = 1200) => page.waitForTimeout(ms);
