/**
 * Feature 103 Task 12: the project-scope Sources view. The list comes from the
 * resources slice plus the existing attachments list read; a failed read is a
 * failure state, never an empty project.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import SourcesView from "../components/Sources/SourcesView";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { setResources } from "../src/store/resourcesSlice";
import {
  createSourceResource,
  createTextResource,
} from "../src/lib/models/resource-factory";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../src/lib/models/locked-access";
import type { AttachmentEntryView } from "../src/lib/api/source-attachments";
import { runAxe } from "./a11y/helpers/axe";

const listAttachments = vi.fn();
vi.mock("../src/lib/api/source-attachments", () => ({
  listAttachments: (...a: unknown[]) => listAttachments(...a),
}));

const INTERVIEW = {
  ...createSourceResource({ name: "Interview" }),
  resourceSubtype: "Primary",
};
const LETTERS = createSourceResource({ name: "Letters" });
const CHAPTER = createTextResource({ name: "Chapter One" });

function entry(id: string): AttachmentEntryView {
  return {
    id,
    fileName: `${id}.pdf`,
    originalName: `${id}.pdf`,
    mime: "application/pdf",
    size: 10,
    addedAt: "2026-11-07T00:00:00.000Z",
  };
}

function mount(
  resources: Parameters<typeof setResources>[0],
  onOpenSource?: (id: string) => void,
) {
  const store = makeStore();
  store.dispatch(setProject({ id: "p", rootPath: "/test/p" }));
  store.dispatch(setSelectedProjectId("p"));
  store.dispatch(setResources(resources));
  const view = render(
    <Provider store={store}>
      <SourcesView onOpenSource={onOpenSource} />
    </Provider>,
  );
  return { store, ...view };
}

beforeEach(() => {
  listAttachments.mockReset();
  listAttachments.mockImplementation(async (_p: string, id: string) =>
    id === INTERVIEW.id ? [entry("a"), entry("b")] : [],
  );
});

describe("SourcesView list", () => {
  it("shows name, subtype and attachment count for every Source and no non-Source", async () => {
    mount([INTERVIEW, CHAPTER, LETTERS]);
    const rows = await screen.findAllByRole("row");
    // header + two Sources
    expect(rows).toHaveLength(3);
    const interview = within(
      screen.getByRole("button", { name: "Interview" }).closest("tr")!,
    );
    expect(interview.getByText("Primary")).toBeInTheDocument();
    expect(interview.getByText("2")).toBeInTheDocument();
    const letters = within(
      screen.getByRole("button", { name: "Letters" }).closest("tr")!,
    );
    expect(letters.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText("Chapter One")).toBeNull();
    expect(listAttachments).toHaveBeenCalledTimes(2);
    expect(listAttachments).not.toHaveBeenCalledWith("p", CHAPTER.id);
  });

  it("selecting a row selects that Source in the store and calls onOpenSource", async () => {
    const onOpenSource = vi.fn();
    const { store } = mount([INTERVIEW, LETTERS], onOpenSource);
    await userEvent.click(
      await screen.findByRole("button", { name: "Letters" }),
    );
    expect(store.getState().resources.selectedResourceId).toBe(LETTERS.id);
    expect(onOpenSource).toHaveBeenCalledWith(LETTERS.id);
  });
});

describe("SourcesView failure and empty states", () => {
  it("renders a failure, not an empty state, when a read throws", async () => {
    listAttachments.mockRejectedValue(new Error("disk unreadable"));
    mount([INTERVIEW, LETTERS]);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("disk unreadable");
    expect(screen.queryByText(/no sources/i)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it.each([
    ["ProjectLockedError", () => new ProjectLockedError("p")],
    ["MissingProjectKeyError", () => new MissingProjectKeyError("p")],
  ])(
    "renders a locked failure for %s, not an empty project",
    async (_n, make) => {
      listAttachments.mockRejectedValue(make());
      mount([INTERVIEW]);
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/locked/i);
      expect(screen.queryByText(/no sources/i)).toBeNull();
      expect(screen.queryByRole("table")).toBeNull();
    },
  );

  it("shows an empty state, distinct from the failure, for a project with no Sources", async () => {
    mount([CHAPTER]);
    expect(
      await screen.findByText(/no sources in this project/i),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(listAttachments).not.toHaveBeenCalled();
  });

  it("retries the read from the failure state", async () => {
    listAttachments.mockRejectedValueOnce(new Error("boom"));
    mount([LETTERS]);
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Letters" })).toBeVisible(),
    );
  });
});

describe("a11y: SourcesView", () => {
  it.each(["list", "empty", "failure"])(
    "has no axe violations (%s)",
    async (state) => {
      if (state === "failure") {
        listAttachments.mockRejectedValue(new Error("boom"));
      }
      const { container } = mount(
        state === "empty" ? [CHAPTER] : [INTERVIEW, LETTERS],
      );
      await waitFor(() =>
        expect(screen.queryByText(/loading sources/i)).toBeNull(),
      );
      await runAxe(container, ["region"]);
    },
  );
});
