import { test, expect } from "@playwright/test";

// Feature 103, Task 22 (FR-17, FR-18). The stories replace `fetch` for the
// attachment routes with a stateful mock (see the story file), so an add and a
// remove made through the UI show in the next read.

const FLOW = "/iframe.html?id=sources-sourcesviewattachmentsflow--flow";
const LOCKED_VIEW =
  "/iframe.html?id=sources-sourcesviewattachmentsflow--project-locked";
const LOCKED_PREVIEW =
  "/iframe.html?id=sources-sourcesviewattachmentsflow--preview-locked";
const OPEN_ATTACHMENTS = {
  name: "Show attachments of Interview with the archivist",
};

test("Sources view: add an attachment to a Source", async ({ page }) => {
  await page.goto(`${FLOW}&viewMode=story`);
  await page.getByRole("button", OPEN_ATTACHMENTS).click();

  const list = page.getByRole("list", { name: "Attachments" });
  await expect(list.getByRole("listitem")).toHaveCount(2);

  await page
    .getByLabel("Add attachment file")
    .setInputFiles({
      name: "added.png",
      mimeType: "image/png",
      buffer: Buffer.from("e2e image bytes"),
    });

  await expect(page.getByText("Added added.png.")).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(list.getByRole("listitem").nth(2)).toContainText("added.png");
});

test("Sources view: preview shows the image, playback shows audio controls", async ({
  page,
}) => {
  await page.goto(`${FLOW}&viewMode=story`);
  await page.getByRole("button", OPEN_ATTACHMENTS).click();

  const imageToggle = page.getByRole("button", {
    name: "Preview portrait.png",
  });
  await expect(imageToggle).toHaveAttribute("aria-expanded", "false");
  await imageToggle.click();
  await expect(
    page.getByRole("button", { name: "Hide portrait.png" }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("img", { name: "portrait.png" })).toBeVisible();

  await page.getByRole("button", { name: "Preview interview.wav" }).click();
  const audio = page.locator('audio[aria-label="Audio: interview.wav"]');
  await expect(audio).toHaveCount(1);
  await expect(audio).toHaveAttribute("controls", "");

  // Hiding the preview removes the element.
  await page.getByRole("button", { name: "Hide portrait.png" }).click();
  await expect(page.getByRole("img", { name: "portrait.png" })).toHaveCount(0);
});

test("Sources view: removing an attachment sends it to Trash", async ({
  page,
}) => {
  await page.goto(`${FLOW}&viewMode=story`);
  await page.getByRole("button", OPEN_ATTACHMENTS).click();

  const list = page.getByRole("list", { name: "Attachments" });
  await expect(list.getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: "Remove interview.wav" }).click();

  await expect(page.getByText(/Restore it from the Trash/)).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).not.toContainText("interview.wav");
});

test("Sources view: a locked project is shown as locked, not as empty", async ({
  page,
}) => {
  await page.goto(`${LOCKED_VIEW}&viewMode=story`);

  await expect(page.getByRole("alert")).toContainText(/locked/i);
  await expect(page.getByText("No Sources in this project.")).toHaveCount(0);
  await expect(page.getByRole("button", OPEN_ATTACHMENTS)).toHaveCount(0);
});

test("Sources view: a locked byte read shows a locked alert, not an empty preview", async ({
  page,
}) => {
  await page.goto(`${LOCKED_PREVIEW}&viewMode=story`);
  await page.getByRole("button", OPEN_ATTACHMENTS).click();
  await page.getByRole("button", { name: "Preview portrait.png" }).click();

  await expect(page.getByRole("alert")).toContainText(/locked/i);
  await expect(page.getByRole("img", { name: "portrait.png" })).toHaveCount(0);
});
