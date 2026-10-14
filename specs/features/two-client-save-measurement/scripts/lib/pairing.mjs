/**
 * Feature 78 harness: pair a fresh browser context as its own device.
 *
 * Same mechanism as Feature 80's scripts: write `pairing-state.json` (a salted
 * HMAC of a random 6-digit code, never the code) into the throwaway sharing
 * directory, then type the code into the real pairing page of a fresh context.
 * The code and the cookie value are never printed, logged or written; only the
 * presence of the `getwrite_device` cookie is recorded.
 *
 * Pair contexts one at a time: there is one pairing-state file.
 */
import { createHmac, randomBytes, randomInt } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { errLine } from "./util.mjs";

export function writePairingState(sharingDir, code) {
  const salt = randomBytes(16);
  const now = Date.now();
  writeFileSync(
    path.join(sharingDir, "pairing-state.json"),
    JSON.stringify({
      version: 1,
      salt: salt.toString("hex"),
      codeHash: createHmac("sha256", salt).update(code).digest("hex"),
      expiresAt: now + 300000,
      attempts: 0,
      dead: false,
      used: false,
      generatedAt: now,
    }),
  );
}

/**
 * @returns {Promise<{context: import("@playwright/test").BrowserContext,
 *   facts: {paired: boolean, deviceCookiePresent: boolean, cookieNames: string[], error?: string}}>}
 */
export async function pairContext(browser, server, label) {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const facts = { label, paired: false, deviceCookiePresent: false, cookieNames: [] };
  const page = await context.newPage();
  try {
    const code = String(randomInt(0, 1000000)).padStart(6, "0");
    writePairingState(server.sharingDir, code);
    await page.goto(`${server.baseUrl}/pair`, { waitUntil: "load" });
    await page.locator('input[inputmode="numeric"]').fill(code);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !location.pathname.startsWith("/pair"), null, {
      timeout: 20000,
    });
    const cookies = await context.cookies(server.baseUrl);
    facts.cookieNames = cookies.map((c) => c.name);
    facts.deviceCookiePresent = cookies.some((c) => c.name === "getwrite_device");
    facts.paired = facts.deviceCookiePresent;
  } catch (e) {
    facts.error = errLine(e);
  } finally {
    await page.close().catch(() => {});
  }
  if (!facts.paired) {
    await context.close().catch(() => {});
    throw new Error(`pairing failed for ${label}: ${facts.error ?? "no device cookie"}`);
  }
  return { context, facts };
}
