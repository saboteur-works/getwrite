/** @vitest-environment jsdom */
/**
 * Feature 107, Task 11 (FR-4, FR-8, FR-13, FR-17): the presentational share
 * sheet. Props in, callbacks out; nothing is fetched or written here.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShareSheet, {
  type ShareSheetProps,
} from "../../components/Capture/ShareSheet";
import type {
  ShareItem,
  ShareResult,
} from "../../src/lib/api/share-capture-types";

afterEach(cleanup);

const ITEMS: ShareItem[] = [
  { kind: "text", text: "Remember the tide tables" },
  { kind: "text", text: "  https://example.com/lighthouse  " },
  {
    kind: "image",
    uri: "content://x/1",
    name: "cliff.jpg",
    mimeType: "image/jpeg",
  },
];

// Option ids stand for on-disk directory ids (the hook's `directoryIdOf`),
// which differ from any manifest id; the sheet reports the id it was given,
// unchanged.
const OPTIONS: ShareSheetProps["options"] = [
  { kind: "named", id: "dir-novel", label: "The Lighthouse Novel" },
  { kind: "named", id: "dir-essays", label: "Essays" },
  {
    kind: "locked",
    id: "dir-secret",
    label: "Locked project",
    encryptedAt: "2026-03-01T00:00:00.000Z",
  },
];

function sheet(props: Partial<ShareSheetProps> = {}): JSX.Element {
  return (
    <ShareSheet
      isOpen
      phase="picking"
      items={ITEMS}
      status="ready"
      options={OPTIONS}
      defaultProjectId="dir-essays"
      errorMessage={null}
      onRetry={vi.fn()}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      onDone={vi.fn()}
      {...props}
    />
  );
}

function result(items: ShareResult["items"]): ShareResult {
  return {
    shareId: "s1",
    items,
    capturedCount: items.filter((i) => i.status === "captured").length,
  };
}

describe("ShareSheet picking", () => {
  it("is a labelled dialog with an accessible name and the item count", () => {
    render(sheet());
    const dialog = screen.getByRole("dialog", { name: /share to getwrite/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/3 items/i)).toBeInTheDocument();
  });

  it("says 1 item in the singular", () => {
    render(sheet({ items: [ITEMS[0]] }));
    expect(screen.getByText(/1 item\b/i)).toBeInTheDocument();
  });

  it("summarises each item in one line with no editing control", () => {
    render(sheet());
    const list = screen.getByRole("list", { name: /items to capture/i });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Text: Remember the tide tables");
    expect(rows[1]).toHaveTextContent("Link: https://example.com/lighthouse");
    expect(rows[2]).toHaveTextContent("Image: cliff.jpg");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("truncates a long text to one line", () => {
    render(
      sheet({ items: [{ kind: "text", text: "a".repeat(500) + "\nsecond" }] }),
    );
    const row = screen.getByRole("listitem");
    expect((row.textContent ?? "").length).toBeLessThan(120);
    expect(row.textContent).not.toContain("second");
  });

  it("offers one picker from the props, defaulted, locked shown as Locked project", () => {
    render(sheet());
    const select = screen.getByRole("combobox", { name: "Project" });
    expect(select).toHaveValue("dir-essays");
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(
      screen.getByRole("option", { name: /^Locked project/ }),
    ).toBeInTheDocument();
  });

  it("confirms with the chosen directory id", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(sheet({ onConfirm }));
    await user.selectOptions(screen.getByRole("combobox"), "dir-novel");
    await user.click(screen.getByRole("button", { name: "Capture" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("dir-novel");
  });

  it("confirms the default when nothing is changed", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(sheet({ onConfirm }));
    await user.click(screen.getByRole("button", { name: "Capture" }));
    expect(onConfirm).toHaveBeenCalledWith("dir-essays");
  });

  it("cancel and Escape call onCancel and never confirm", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(sheet({ onCancel, onConfirm }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows loading, with confirm disabled", () => {
    render(sheet({ status: "loading", options: [], defaultProjectId: null }));
    expect(screen.getByText(/loading projects/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Capture" })).toBeDisabled();
  });

  it("shows empty as a project being needed, with confirm disabled", () => {
    render(sheet({ status: "empty", options: [], defaultProjectId: null }));
    expect(screen.getByText(/a project is needed/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("button", { name: "Capture" })).toBeDisabled();
  });

  it("shows failed as an alert with Retry, not as empty", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      sheet({
        status: "failed",
        options: [],
        defaultProjectId: null,
        errorMessage: "Could not load your projects.",
        onRetry,
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load your projects.",
    );
    expect(screen.queryByText(/a project is needed/i)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Capture" })).toBeDisabled();
  });

  it("shows the queued count in a status region only when above zero", () => {
    const { rerender } = render(sheet({ queuedCount: 0 }));
    expect(screen.queryByText(/waiting/i)).toBeNull();
    rerender(sheet({ queuedCount: 2 }));
    const status = screen
      .getAllByRole("status")
      .find((el: HTMLElement) => /waiting/i.test(el.textContent ?? ""));
    expect(status).toHaveTextContent("2 more shares waiting");
    rerender(sheet({ queuedCount: 1 }));
    expect(screen.getByText("1 more share waiting")).toBeInTheDocument();
  });
});

describe("ShareSheet pending", () => {
  it("disables confirm and Cancel while capturing", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(sheet({ phase: "pending", onCancel, onConfirm }));
    expect(screen.getByRole("button", { name: "Capturing…" })).toBeDisabled();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toBeDisabled();
    await user.click(cancel);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Escape while capturing does not call onCancel and keeps the dialog open", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onDone = vi.fn();
    render(sheet({ phase: "pending", onCancel, onDone }));
    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: /share to getwrite/i }),
    ).toBeInTheDocument();
  });

  it("an outside click while capturing does not call onCancel", () => {
    const onCancel = vi.fn();
    render(sheet({ phase: "pending", onCancel }));
    fireEvent.pointerDown(document.body);
    fireEvent.pointerUp(document.body);
    fireEvent.click(document.body);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Cancel is enabled again while choosing", () => {
    render(sheet({ phase: "picking" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });
});

describe("ShareSheet result", () => {
  it("all succeeded: status region, count, no alert", () => {
    render(
      sheet({
        phase: "result",
        result: result([
          {
            status: "captured",
            index: 0,
            kind: "text",
            resourceId: "r1",
            inboxFolderId: "i",
          },
          {
            status: "captured",
            index: 1,
            kind: "text",
            resourceId: "r2",
            inboxFolderId: "i",
          },
          {
            status: "captured",
            index: 2,
            kind: "image",
            resourceId: "r3",
            inboxFolderId: "i",
          },
        ]),
      }),
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("3 of 3 items became resources.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("partial failure: alert names each refused or failed item with its message", () => {
    render(
      sheet({
        phase: "result",
        result: result([
          {
            status: "captured",
            index: 0,
            kind: "text",
            resourceId: "r1",
            inboxFolderId: "i",
          },
          {
            status: "refused",
            index: 2,
            kind: "image",
            message: "cliff.jpg is 40.0 MB; the limit is 30 MB.",
          },
          { status: "failed", index: 1, kind: "text", message: "Read failed." },
        ]),
      }),
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("1 of 3 items became resources.");
    expect(alert).toHaveTextContent("Image: cliff.jpg");
    expect(alert).toHaveTextContent(
      "cliff.jpg is 40.0 MB; the limit is 30 MB.",
    );
    expect(alert).toHaveTextContent("Link: https://example.com/lighthouse");
    expect(alert).toHaveTextContent("Read failed.");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("the count comes from the item results, so it never disagrees with them", () => {
    const r = result([
      { status: "failed", index: 0, kind: "text", message: "boom" },
    ]);
    r.capturedCount = 5;
    render(sheet({ phase: "result", items: [ITEMS[0]], result: r }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "0 of 1 item became a resource.",
    );
    expect(screen.queryByText(/5 of/)).toBeNull();
  });

  it("Done and Escape call onDone, not onCancel", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const onCancel = vi.fn();
    render(
      sheet({
        phase: "result",
        onDone,
        onCancel,
        result: result([
          {
            status: "captured",
            index: 0,
            kind: "text",
            resourceId: "r1",
            inboxFolderId: "i",
          },
        ]),
        items: [ITEMS[0]],
      }),
    );
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.keyboard("{Escape}");
    expect(onDone).toHaveBeenCalledTimes(2);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("does not move focus into the live region", () => {
    render(
      sheet({
        phase: "result",
        result: result([
          { status: "failed", index: 0, kind: "text", message: "boom" },
        ]),
        items: [ITEMS[0]],
      }),
    );
    expect(screen.getByRole("alert")).not.toHaveFocus();
  });
});

describe("ShareSheet closed and colour", () => {
  it("renders no dialog when closed", () => {
    render(sheet({ isOpen: false }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uses no red class", () => {
    render(sheet({ queuedCount: 1 }));
    expect(document.body.innerHTML).not.toMatch(
      /(^|[^a-z])red([^a-z]|$)|#D44040/i,
    );
  });
});
