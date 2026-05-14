import { test, expect } from "@playwright/test";

test("editview interactive variant tracks content changes", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-editview--interactive");

    const editor = page
        .locator('[role="textbox"], [contenteditable="true"]')
        .first();
    const contentProbe = page.locator('[data-testid="editor-content"]');

    await editor.click();
    await page.keyboard.type("Test content");

    await expect(contentProbe).toContainText("Test content", { timeout: 2000 });
});

test("editview displays initial content", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-editview--default");

    const editor = page
        .locator('[role="textbox"], [contenteditable="true"]')
        .first();
    const content = await editor.textContent();

    expect(content).toContain("Opening");
});

test("editview interactive variant captures typing", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-editview--interactive");

    const editor = page
        .locator('[role="textbox"], [contenteditable="true"]')
        .first();

    await editor.click();
    await page.keyboard.type("New paragraph");

    await expect(editor).toContainText("New paragraph");
});
