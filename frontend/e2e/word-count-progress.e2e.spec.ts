import { test, expect } from "@playwright/test";

test("WordCountProgressBar InProgress story renders progressbar", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-wordcountprogressbar--in-progress");
    const bar = page.getByRole("progressbar");
    await expect(bar).toBeVisible();
});

test("WordCountProgressBar InProgress story shows aria values", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-wordcountprogressbar--in-progress");
    const bar = page.getByRole("progressbar");
    await expect(bar).toHaveAttribute("aria-valuemin", "0");
    const max = await bar.getAttribute("aria-valuemax");
    expect(Number(max)).toBeGreaterThan(0);
    const now = await bar.getAttribute("aria-valuenow");
    expect(Number(now)).toBeGreaterThan(0);
    expect(Number(now)).toBeLessThanOrEqual(Number(max));
});

test("WordCountProgressBar Achieved story shows Goal reached text", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-wordcountprogressbar--achieved");
    const bar = page.getByRole("progressbar");
    await expect(bar).toBeVisible();
    await expect(page.getByText(/Goal reached/i)).toBeVisible();
});

test("WordCountProgressBar Empty story renders bar at zero", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-wordcountprogressbar--empty");
    const bar = page.getByRole("progressbar");
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute("aria-valuenow", "0");
});
