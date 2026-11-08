/** @vitest-environment jsdom */
/**
 * Feature 103 Task 29 (FR-19, FR-31): axe checks and keyboard operability of
 * the Sources view excerpts section and the locator field, in its listed,
 * empty, failed and limited states (`docs/standards/accessibility.md`).
 * `region` is disabled because the harness mounts the section without the app
 * shell's landmarks (test-harness isolation, not a defect).
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { runAxe } from "./helpers/axe";
import ExcerptsSection from "../../components/Sources/ExcerptsSection";
import LocatorField, {
  EMPTY_LOCATOR_DRAFT,
} from "../../components/Sources/LocatorField";
import TrashRefreshProvider from "../../components/Layout/TrashRefreshContext";
import { StaticSharingLimitsProvider } from "../../components/Sharing/SharingLimitsContext";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setResources } from "../../src/store/resourcesSlice";
import { createSourceResource } from "../../src/lib/models/resource-factory";
import type { Annotation } from "../../src/lib/models/types";

const listAnnotations = vi.fn();
vi.mock("../../src/lib/api/annotations", () => ({
  listAnnotations: (...a: unknown[]) => listAnnotations(...a),
  addAnnotation: vi.fn(),
  deleteAnnotation: vi.fn(),
}));
const listAttachments = vi.fn();
vi.mock("../../src/lib/api/source-attachments", () => ({
  listAttachments: (...a: unknown[]) => listAttachments(...a),
  addAttachment: vi.fn(),
  replaceAttachment: vi.fn(),
  removeAttachment: vi.fn(),
  reorderAttachments: vi.fn(),
}));

const SOURCE = createSourceResource({ name: "Interview" });
const IMAGE_ID = "11111111-1111-4111-8111-111111111111";
const EXCERPTS: Annotation[] = [
  {
    id: "e1",
    body: "the greeting",
    quote: "hello",
    createdAt: "t",
    updatedAt: "t",
    target: { sourceId: SOURCE.id, locator: { type: "page", value: "12" } },
  },
  {
    id: "e2",
    body: "",
    quote: "",
    createdAt: "t",
    updatedAt: "t",
    target: {
      sourceId: SOURCE.id,
      attachmentId: IMAGE_ID,
      locator: { type: "timestamp", value: "01:02" },
    },
  },
];

function mount(limited = false): ReturnType<typeof render> {
  const store = makeStore();
  store.dispatch(setProject({ id: "p", rootPath: "/test/p" }));
  store.dispatch(setSelectedProjectId("p"));
  store.dispatch(setResources([SOURCE]));
  return render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <StaticSharingLimitsProvider
          value={
            limited
              ? {
                  state: {
                    state: "paired",
                    limits: {
                      projectDeletion: false,
                      unlocking: false,
                      locking: false,
                      encryptionChanges: false,
                      permanentDeletion: true,
                    },
                  },
                }
              : undefined
          }
        >
          <ExcerptsSection resource={SOURCE} />
        </StaticSharingLimitsProvider>
      </TrashRefreshProvider>
    </Provider>,
  );
}

beforeEach(() => {
  listAnnotations.mockReset();
  listAttachments.mockReset();
  listAnnotations.mockResolvedValue(EXCERPTS);
  listAttachments.mockResolvedValue([
    {
      id: IMAGE_ID,
      fileName: IMAGE_ID,
      originalName: "scan.png",
      mime: "image/png",
      size: 10,
      addedAt: "2026-11-07T00:00:00.000Z",
    },
  ]);
});

describe("a11y: ExcerptsSection", () => {
  it("has no axe violations with excerpts listed", async () => {
    const { container } = mount();
    await screen.findByRole("list", { name: "Excerpts" });
    await screen.findByRole("combobox", { name: "Attachment to excerpt" });
    await runAxe(container, ["region"]);
  });

  it("has no axe violations with no excerpts", async () => {
    listAnnotations.mockResolvedValue([]);
    const { container } = mount();
    await screen.findByText("No excerpts yet.");
    await runAxe(container, ["region"]);
  });

  it("has no axe violations when the read failed", async () => {
    listAnnotations.mockRejectedValue(new Error("unreadable"));
    const { container } = mount();
    await screen.findByRole("alert");
    await runAxe(container, ["region"]);
  });

  it("has no axe violations with delete limited and its reason shown", async () => {
    const { container } = mount(true);
    await screen.findByRole("list", { name: "Excerpts" });
    await runAxe(container, ["region"]);
  });

  it("every control is reached by Tab, in order, and the group is named", async () => {
    mount();
    const group = await screen.findByRole("group", {
      name: "Excerpts of Interview",
    });
    await screen.findByRole("combobox", { name: "Attachment to excerpt" });
    const user = userEvent.setup();
    const names: string[] = [];
    await user.tab();
    for (let i = 0; i < 12 && group.contains(document.activeElement); i += 1) {
      const el = document.activeElement as HTMLElement;
      names.push(el.getAttribute("aria-label") ?? el.textContent ?? "");
      await user.tab();
    }
    expect(names).toEqual([
      "Attachment to excerpt",
      "Attachment excerpt locator type",
      "Attachment excerpt locator value",
      "Record attachment excerpt",
      "Delete excerpt hello",
      "Delete excerpt of scan.png",
    ]);
  });
});

describe("a11y: LocatorField", () => {
  it("has no axe violations and names the group", async () => {
    const { container } = render(
      <LocatorField
        idPrefix="t"
        legend="Locator"
        draft={EMPTY_LOCATOR_DRAFT}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("group", { name: "Locator" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("group")).getByRole("textbox", {
        name: "Locator value",
      }),
    ).toBeInTheDocument();
    await runAxe(container, ["region"]);
  });
});
