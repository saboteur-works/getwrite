/** @vitest-environment jsdom */
/**
 * Feature 108, Task 21 (FR-6, FR-11, FR-12, FR-13, FR-15): the presentational
 * claim row. Props in, callbacks out; statement and quote are text, an
 * off-list status is shown marked, and with the module off the row is an
 * ordinary note.
 */
import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClaimRow, {
  type ClaimRowProps,
} from "../../components/Editor/Annotations/ClaimRow";
import type { Annotation } from "../../src/lib/models/types";
import { runAxe } from "../a11y/helpers/axe";

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";

function claim(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: "c1",
    body: "The harbour opened in 1902.",
    quote: "opened in 1902",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    claim: {
      status: "unverified",
      statusChangedAt: "2026-11-05T12:00:00.000Z",
    },
    ...overrides,
  };
}

function props(overrides: Partial<ClaimRowProps> = {}): ClaimRowProps {
  return {
    annotation: claim(),
    moduleEnabled: true,
    sourcesEnabled: true,
    isDetached: false,
    ...overrides,
  };
}

afterEach(() => vi.clearAllMocks());

describe("ClaimRow (module on)", () => {
  it("shows that it is a claim, the statement, quote, status and date", () => {
    render(<ClaimRow {...props()} />);
    expect(screen.getByText("Claim")).toBeInTheDocument();
    expect(screen.getByText("The harbour opened in 1902.")).toBeInTheDocument();
    expect(screen.getByText("opened in 1902")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toHaveValue("unverified");
    expect(
      screen.getByText(/Status changed 20\d\d-\d\d-\d\d/),
    ).toBeInTheDocument();
  });

  it("renders statement and quote as text, never HTML", () => {
    const { container } = render(
      <ClaimRow
        {...props({
          annotation: claim({
            body: "<b>bold</b>",
            quote: "<img src=x onerror=alert(1)>",
          }),
        })}
      />,
    );
    expect(screen.getByText("<b>bold</b>")).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("offers the four status labels and calls back with the chosen id", () => {
    const onStatusChange = vi.fn();
    render(<ClaimRow {...props({ onStatusChange })} />);
    const select = screen.getByLabelText("Status");
    const labels = within(select)
      .getAllByRole("option")
      .map((o: HTMLElement) => o.textContent);
    expect(labels).toEqual([
      "Unverified",
      "Verified",
      "Disputed",
      "Needs review",
    ]);
    fireEvent.change(select, { target: { value: "disputed" } });
    expect(onStatusChange).toHaveBeenCalledWith("disputed");
    // Controlled by the stored value: not optimistic.
    expect(select).toHaveValue("unverified");
  });

  it("shows an off-list status as stored and marked, and never calls back for it", () => {
    const onStatusChange = vi.fn();
    render(
      <ClaimRow
        {...props({
          annotation: claim({
            claim: {
              status: "archived",
              statusChangedAt: "2026-11-05T12:00:00.000Z",
            },
          }),
          onStatusChange,
        })}
      />,
    );
    expect(screen.getByLabelText("Status")).toHaveValue("archived");
    expect(
      screen.getByText(/archived/, { selector: "option" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not a listed status/i, { selector: "p" }),
    ).toBeInTheDocument();
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("says unsourced in text for a claim with no Source, even when Verified", () => {
    render(
      <ClaimRow
        {...props({
          annotation: claim({
            claim: {
              status: "verified",
              statusChangedAt: "2026-11-05T12:00:00.000Z",
            },
          }),
        })}
      />,
    );
    expect(screen.getByText(/unsourced/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toHaveValue("verified");
  });

  it("shows the Source line for a present Source", () => {
    render(
      <ClaimRow
        {...props({
          annotation: claim({
            target: { sourceId: SOURCE_ID, sourceName: "Harbour Ledger" },
          }),
          sourceFacts: { source: "present" },
        })}
      />,
    );
    expect(screen.getByTestId("claim-source").textContent).toBe(
      "Source: Harbour Ledger",
    );
    expect(screen.queryByText(/unsourced/i)).toBeNull();
  });

  it("shows removed, permanently deleted and could-not-be-checked Source states", () => {
    const target = { sourceId: SOURCE_ID, sourceName: "Harbour Ledger" };
    const { rerender } = render(
      <ClaimRow
        {...props({
          annotation: claim({ target }),
          sourceFacts: { source: "in-trash" },
        })}
      />,
    );
    expect(screen.getByTestId("claim-source").textContent).toContain(
      "(removed)",
    );
    rerender(
      <ClaimRow
        {...props({
          annotation: claim({ target }),
          sourceFacts: { source: "absent" },
        })}
      />,
    );
    expect(screen.getByTestId("claim-source").textContent).toContain(
      "permanently deleted",
    );
    rerender(
      <ClaimRow
        {...props({ annotation: claim({ target }), sourceFacts: "unreadable" })}
      />,
    );
    expect(screen.getByTestId("claim-source").textContent).toContain(
      "The Source could not be checked.",
    );
    expect(screen.queryByText(/unsourced/i)).toBeNull();
    expect(screen.getByLabelText("Status")).toHaveValue("unverified");
  });

  it("shows Re-attach for a detached claim and calls back", () => {
    const onReattach = vi.fn();
    render(
      <ClaimRow
        {...props({ isDetached: true, hasSelection: true, onReattach })}
      />,
    );
    expect(screen.getByText(/Saved quote/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Re-attach claim to selected text" }),
    );
    expect(onReattach).toHaveBeenCalledTimes(1);
  });

  it("disables Re-attach with no selection and omits it when attached", () => {
    const { rerender } = render(
      <ClaimRow
        {...props({
          isDetached: true,
          hasSelection: false,
          onReattach: vi.fn(),
        })}
      />,
    );
    expect(screen.getByRole("button", { name: /Re-attach/ })).toBeDisabled();
    rerender(<ClaimRow {...props({ isDetached: false })} />);
    expect(screen.queryByRole("button", { name: /Re-attach/ })).toBeNull();
  });

  it("renders the link control only when Sources is on, keeping the removed line visible when off", () => {
    const onRelink = vi.fn();
    const target = { sourceId: SOURCE_ID, sourceName: "Harbour Ledger" };
    const base = {
      annotation: claim({ target }),
      sourceFacts: { source: "in-trash" } as const,
      onRelink,
    };
    const { rerender } = render(
      <ClaimRow {...props({ ...base, sourcesEnabled: true })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Change Source" }));
    expect(onRelink).toHaveBeenCalledTimes(1);
    rerender(<ClaimRow {...props({ ...base, sourcesEnabled: false })} />);
    expect(screen.queryByRole("button", { name: /Source/ })).toBeNull();
    expect(screen.getByTestId("claim-source").textContent).toContain(
      "Harbour Ledger",
    );
    expect(screen.getByTestId("claim-source").textContent).toContain(
      "(removed)",
    );
  });

  it("offers Link Source for an unsourced claim when Sources is on", () => {
    render(<ClaimRow {...props({ onRelink: vi.fn() })} />);
    expect(
      screen.getByRole("button", { name: "Link Source" }),
    ).toBeInTheDocument();
  });

  it("edits the statement: a failure keeps the form with its message, then success closes it", async () => {
    const onSaveStatement = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: "Could not save." })
      .mockResolvedValueOnce({ ok: true });
    render(<ClaimRow {...props({ onSaveStatement })} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit statement" }));
    fireEvent.change(screen.getByLabelText("Claim statement"), {
      target: { value: "New statement" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save statement" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save.",
    );
    expect(screen.getByLabelText("Claim statement")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save statement" }));
    await waitFor(() =>
      expect(screen.queryByLabelText("Claim statement")).toBeNull(),
    );
    expect(onSaveStatement).toHaveBeenNthCalledWith(2, "New statement");
  });

  it("refuses an empty statement even with a Source link", () => {
    render(
      <ClaimRow
        {...props({
          annotation: claim({ target: { sourceId: SOURCE_ID } }),
          sourceFacts: { source: "present" },
          onSaveStatement: vi.fn(),
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit statement" }));
    fireEvent.change(screen.getByLabelText("Claim statement"), {
      target: { value: "" },
    });
    expect(
      screen.getByRole("button", { name: "Save statement" }),
    ).toBeDisabled();
  });

  it("disables Delete with its visible reason", () => {
    render(
      <ClaimRow
        {...props({
          onDelete: vi.fn(),
          deleteDisabledReason: "Not on a paired device.",
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Delete claim" })).toBeDisabled();
    expect(screen.getByText("Not on a paired device.")).toBeInTheDocument();
  });

  it("has no axe violations in the claim, detached and editing states", async () => {
    const { container, rerender } = render(
      <ClaimRow
        {...props({
          annotation: claim({
            target: { sourceId: SOURCE_ID, sourceName: "Ledger" },
          }),
          sourceFacts: { source: "present" },
          onRelink: vi.fn(),
          onSaveStatement: vi.fn(),
          onDelete: vi.fn(),
        })}
      />,
    );
    await runAxe(container);
    rerender(
      <ClaimRow
        {...props({
          isDetached: true,
          onReattach: vi.fn(),
          onSaveStatement: vi.fn(),
        })}
      />,
    );
    await runAxe(container);
    fireEvent.click(screen.getByRole("button", { name: "Edit statement" }));
    await runAxe(container);
  });
});

describe("ClaimRow (module off)", () => {
  const off = (overrides: Partial<ClaimRowProps> = {}): ClaimRowProps =>
    props({ moduleEnabled: false, ...overrides });

  it("renders an ordinary note: body, no marker, status or Source line", () => {
    render(
      <ClaimRow
        {...off({
          annotation: claim({
            target: { sourceId: SOURCE_ID, sourceName: "Ledger" },
          }),
        })}
      />,
    );
    expect(screen.getByText("The harbour opened in 1902.")).toBeInTheDocument();
    expect(screen.queryByText("Claim")).toBeNull();
    expect(screen.queryByLabelText("Status")).toBeNull();
    expect(screen.queryByTestId("claim-source")).toBeNull();
    expect(screen.queryByText(/unsourced/i)).toBeNull();
    expect(screen.queryByText(/Status changed/)).toBeNull();
  });

  it("edits the body as a note through the same callback", async () => {
    const onSaveStatement = vi.fn().mockResolvedValue({ ok: true });
    render(<ClaimRow {...off({ onSaveStatement })} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    fireEvent.change(screen.getByLabelText("Note text"), {
      target: { value: "Edited" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(onSaveStatement).toHaveBeenCalledWith("Edited"));
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <ClaimRow {...off({ onSaveStatement: vi.fn() })} />,
    );
    await runAxe(container);
  });
});
