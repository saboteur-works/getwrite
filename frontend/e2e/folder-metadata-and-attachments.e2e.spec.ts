import { test, expect } from "@playwright/test";

// Feature 102, Task 34 (FR-11, FR-24). Both stories replace `fetch` for their
// own route with a stateful mock (see the stories), so a write is visible to
// the next read and the sequence below really round-trips through the UI.

test("folder sidebar view: editing the notes and saving keeps the edit", async ({
  page,
}) => {
  await page.goto(
    "/iframe.html?id=sidebar-foldermetadatasection--folder-view&viewMode=story",
  );

  const notes = page.getByLabel("Folder notes");
  await expect(notes).toHaveValue("Principal cast.");

  const save = page.getByRole("button", { name: "Save folder metadata" });
  await expect(save).toBeDisabled();

  await notes.fill("Principal cast and extras.");
  await expect(page.getByText("Unsaved changes.")).toBeVisible();
  await expect(save).toBeEnabled();

  await save.click();

  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(notes).toHaveValue("Principal cast and extras.");
  await expect(save).toBeDisabled();
});

test("attachments section: add, reorder and remove an attachment", async ({
  page,
}) => {
  await page.goto(
    "/iframe.html?id=sidebar-sourceattachmentssection--attachment-list&viewMode=story",
  );

  const list = page.getByRole("list", { name: "Attachments" });
  const items = list.getByRole("listitem");
  await expect(items).toHaveCount(3);
  await expect(items.first()).toContainText("transcript.pdf");

  // Add: the hidden file input behind the "Add attachment" button.
  await expect(
    page.getByRole("button", { name: "Add attachment" }),
  ).toBeVisible();
  await page
    .getByLabel("Add attachment file")
    .setInputFiles({
      name: "added.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 e2e"),
    });
  await expect(page.getByText("Added added.pdf.")).toBeVisible();
  await expect(items).toHaveCount(4);
  await expect(items.nth(3)).toContainText("added.pdf");

  // Reorder: move the added attachment up one place.
  await page.getByRole("button", { name: "Move added.pdf up" }).click();
  await expect(
    page.getByText(/Moved added\.pdf to position 3 of 4/),
  ).toBeVisible();
  await expect(items.nth(2)).toContainText("added.pdf");
  await expect(items.nth(3)).toContainText("notes.pdf");

  // Remove: the entry leaves the list and the notice points to Trash.
  await page.getByRole("button", { name: "Remove added.pdf" }).click();
  await expect(page.getByText(/Restore it from the Trash/)).toBeVisible();
  await expect(items).toHaveCount(3);
  await expect(list).not.toContainText("added.pdf");
});
