// Usage: node probe-start.mjs <baseUrl> [shotPath]. Prints start-page text and project links.
import { chromium } from "playwright";
const [base, shot] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage();
const errors = [];
p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
await p.goto(base + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
console.log("BODY:\n" + (await p.locator("body").innerText()));
console.log("LINKS:", JSON.stringify(await p.locator("a").evaluateAll((as) => as.map((a) => [a.textContent?.trim(), a.getAttribute("href")]))));
console.log("CONSOLE ERRORS:", JSON.stringify(errors));
if (shot) await p.screenshot({ path: shot, fullPage: true });
await b.close();
