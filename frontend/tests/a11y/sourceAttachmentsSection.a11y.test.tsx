import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { runAxe } from "./helpers/axe";
import SourceAttachmentsSection from "../../components/Sidebar/SourceAttachmentsSection";
import TrashRefreshProvider from "../../components/Layout/TrashRefreshContext";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { createSourceResource } from "../../src/lib/models/resource-factory";

const listAttachments = vi.fn();
const addAttachment = vi.fn();
vi.mock("../../src/lib/api/source-attachments", () => ({
  listAttachments: (...a: unknown[]) => listAttachments(...a),
  addAttachment: (...a: unknown[]) => addAttachment(...a),
  replaceAttachment: vi.fn(),
  removeAttachment: vi.fn(),
  reorderAttachments: vi.fn(),
}));

const SOURCE = createSourceResource({ name: "Interview" });
const entry = (id: string, originalName: string) => ({
  id,
  fileName: `${id}.pdf`,
  originalName,
  mime: "application/pdf",
  size: 2048,
  addedAt: "2026-11-07T00:00:00.000Z",
});

function mount(): ReturnType<typeof render> {
  const store = makeStore();
  store.dispatch(setProject({ id: "p", rootPath: "/test" }));
  store.dispatch(setSelectedProjectId("p"));
  return render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <SourceAttachmentsSection resource={SOURCE} />
      </TrashRefreshProvider>
    </Provider>,
  );
}

beforeEach(() => {
  listAttachments.mockReset();
  addAttachment.mockReset();
  listAttachments.mockResolvedValue([
    entry("a1", "alpha.pdf"),
    entry("b2", "beta.pdf"),
  ]);
});

describe("a11y: SourceAttachmentsSection", () => {
  it("axe passes for the loaded list", async () => {
    const { container } = mount();
    await screen.findByText("alpha.pdf");
    await runAxe(container);
  });

  it("axe passes for an empty list", async () => {
    listAttachments.mockResolvedValue([]);
    const { container } = mount();
    await screen.findByText("No attachments.");
    await runAxe(container);
  });

  it("axe passes for a failed read", async () => {
    listAttachments.mockRejectedValue(new Error("nope"));
    const { container } = mount();
    await screen.findByRole("alert");
    await runAxe(container);
  });

  it("axe passes for a refusal, shown as text in an alert", async () => {
    addAttachment.mockRejectedValue(
      new Error("A Source holds at most 500 attachments."),
    );
    const { container } = mount();
    await screen.findByText("alpha.pdf");
    fireEvent.change(screen.getByLabelText("Add attachment file"), {
      target: {
        files: [new File(["x"], "n.pdf", { type: "application/pdf" })],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("500");
    await runAxe(container);
  });

  it("controls are reached by Tab in order", async () => {
    mount();
    await screen.findByText("alpha.pdf");
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Add attachment" }),
    );
    for (const name of [
      "Move alpha.pdf up",
      "Move alpha.pdf down",
      "Replace alpha.pdf",
      "Remove alpha.pdf",
    ]) {
      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole("button", { name }));
    }
  });
});
