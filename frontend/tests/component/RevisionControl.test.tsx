/**
 * Component + a11y tests for `RevisionControl`'s protect/unprotect control,
 * protected indicator, and delete-refusal messaging (protect-revision
 * Task 7, FR-1, FR-2, FR-4, FR-5). The transport module is mocked so the
 * real slice/thunks run against a real store.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import RevisionControl from "../../components/Editor/RevisionControl/RevisionControl";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import {
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import type { Revision } from "../../src/lib/models/types";
import { runAxe } from "../a11y/helpers/axe";

vi.mock("react-hot-toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../../src/store/revision-transport-service", async (importActual) => ({
  ...(await importActual<
    typeof import("../../src/store/revision-transport-service")
  >()),
  fetchRevisionList: vi.fn(),
  persistRevisionPreserve: vi.fn(),
  removeRevision: vi.fn(),
}));

import { toast } from "react-hot-toast";
import {
  fetchRevisionList,
  persistRevisionPreserve,
  removeRevision,
} from "../../src/store/revision-transport-service";

const mockedList = vi.mocked(fetchRevisionList);
const mockedPreserve = vi.mocked(persistRevisionPreserve);
const mockedRemove = vi.mocked(removeRevision);
const mockedToast = vi.mocked(toast);

const REFUSAL = "Protected revisions cannot be deleted. Unprotect it first.";

function rev(
  id: string,
  versionNumber: number,
  isCanonical: boolean,
  preserve: boolean,
): Revision {
  return {
    id,
    resourceId: "res-1",
    versionNumber,
    createdAt: "2026-09-01T00:00:00.000Z",
    filePath: `revisions/res-1/v-${versionNumber}/content.txt`,
    isCanonical,
    metadata: {
      name: `Name ${versionNumber}`,
      ...(preserve ? { preserve } : {}),
    },
  } as Revision;
}

/** v3 canonical unprotected, v2 non-canonical protected, v1 non-canonical unprotected. */
const REVISIONS: Revision[] = [
  rev("rev-3", 3, true, false),
  rev("rev-2", 2, false, true),
  rev("rev-1", 1, false, false),
];

async function renderControl(revisions: Revision[] = REVISIONS) {
  mockedList.mockResolvedValue({ revisions } as never);
  const store = makeStore();
  store.dispatch(
    setProject({
      id: "proj-1",
      name: "P",
      rootPath: "/tmp/proj-1",
      folders: [],
      resources: [],
    } as never),
  );
  store.dispatch(setSelectedProjectId("proj-1"));
  store.dispatch(
    setResources([
      {
        id: "res-1",
        slug: "c1",
        name: "Chapter 1",
        type: "text",
        createdAt: "2026-09-01T00:00:00.000Z",
        orderIndex: 0,
      },
    ] as never),
  );
  store.dispatch(setSelectedResourceId("res-1"));
  const user = userEvent.setup();
  const view = render(
    <Provider store={store}>
      <RevisionControl />
    </Provider>,
  );
  await user.click(screen.getByRole("button", { name: /expand/i }));
  await screen.findByText("Name 3");
  return { store, user, view };
}

function card(name: string): HTMLElement {
  const el = screen.getByText(name).closest("article");
  if (!el) throw new Error(`no card for ${name}`);
  return el;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RevisionControl protect control", () => {
  it("shows a protect button on canonical and non-canonical cards, and unprotect on protected", async () => {
    await renderControl();
    expect(
      within(card("Name 3")).getByRole("button", {
        name: "Protect revision v3",
      }),
    ).toBeEnabled();
    expect(
      within(card("Name 1")).getByRole("button", {
        name: "Protect revision v1",
      }),
    ).toBeEnabled();
    expect(
      within(card("Name 2")).getByRole("button", {
        name: "Unprotect revision v2",
      }),
    ).toBeEnabled();
    expect(
      within(card("Name 2")).queryByRole("button", {
        name: "Protect revision v2",
      }),
    ).toBeNull();
  });

  it("dispatches the thunk with the revision id and the toggled preserve value", async () => {
    const { user, store } = await renderControl();
    mockedPreserve.mockResolvedValue(rev("rev-3", 3, true, true));
    await user.click(
      within(card("Name 3")).getByRole("button", {
        name: "Protect revision v3",
      }),
    );
    await waitFor(() =>
      expect(mockedPreserve).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: "res-1" }),
        "rev-3",
        true,
      ),
    );
    await waitFor(() =>
      expect(
        store.getState().revisions.revisions.find((r) => r.id === "rev-3")
          ?.isProtected,
      ).toBe(true),
    );

    mockedPreserve.mockResolvedValue(rev("rev-2", 2, false, false));
    await user.click(
      within(card("Name 2")).getByRole("button", {
        name: "Unprotect revision v2",
      }),
    );
    await waitFor(() =>
      expect(mockedPreserve).toHaveBeenLastCalledWith(
        expect.anything(),
        "rev-2",
        false,
      ),
    );
  });

  it("surfaces an error toast when protecting fails", async () => {
    const { user } = await renderControl();
    mockedPreserve.mockRejectedValue(new Error("Disk full"));
    await user.click(
      within(card("Name 1")).getByRole("button", {
        name: "Protect revision v1",
      }),
    );
    await waitFor(() =>
      expect(mockedToast.error).toHaveBeenCalledWith("Disk full"),
    );
    // Still unprotected: the button has not flipped.
    expect(
      within(card("Name 1")).getByRole("button", {
        name: "Protect revision v1",
      }),
    ).toBeInTheDocument();
  });
});

describe("RevisionControl protected indicator", () => {
  it("shows a text-labelled, non-red indicator only on protected cards", async () => {
    await renderControl();
    const indicator = within(card("Name 2")).getByText("Protected");
    expect(indicator).toBeVisible();
    expect(indicator.className).not.toMatch(/red/);
    expect(indicator.className).not.toContain("revision-control-badge");
    expect(within(card("Name 2")).queryByText("Canonical")).toBeNull();
    expect(within(card("Name 1")).queryByText("Protected")).toBeNull();
    expect(within(card("Name 3")).queryByText("Protected")).toBeNull();
    // Icon is decorative; the text carries the meaning.
    expect(indicator.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("shows both Canonical and Protected on a protected canonical card", async () => {
    await renderControl([
      rev("rev-3", 3, true, true),
      rev("rev-1", 1, false, false),
    ]);
    const c = card("Name 3");
    expect(within(c).getByText("Canonical")).toBeInTheDocument();
    expect(within(c).getByText("Protected")).toBeInTheDocument();
    expect(
      within(c).getByRole("button", { name: "Unprotect revision v3" }),
    ).toBeInTheDocument();
  });
});

describe("RevisionControl delete on protected revisions", () => {
  it("keeps Delete enabled and shows the core's refusal message, leaving the revision in place", async () => {
    const { user, store } = await renderControl();
    mockedRemove.mockRejectedValue(new Error(REFUSAL));
    const del = within(card("Name 2")).getByRole("button", {
      name: /delete revision/i,
    });
    expect(del).toBeEnabled();
    await user.click(del);
    await waitFor(() =>
      expect(mockedToast.error).toHaveBeenCalledWith(REFUSAL),
    );
    expect(mockedToast.error).not.toHaveBeenCalledWith(
      "Failed to delete revision.",
    );
    expect(
      store.getState().revisions.revisions.some((r) => r.id === "rev-2"),
    ).toBe(true);
    expect(screen.getByText("Name 2")).toBeInTheDocument();
  });
});

describe("RevisionControl accessibility", () => {
  it("has no axe violations with a protected and an unprotected card", async () => {
    const { view } = await renderControl();
    await runAxe(view.container);
  });
});
