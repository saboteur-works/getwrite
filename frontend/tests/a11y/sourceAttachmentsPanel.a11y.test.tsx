import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { runAxe } from "./helpers/axe";
import SourcesView from "../../components/Sources/SourcesView";
import { uiModuleRegistry } from "../../components/Modules/uiRegistry";
import TrashRefreshProvider from "../../components/Layout/TrashRefreshContext";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setResources } from "../../src/store/resourcesSlice";
import { createSourceResource } from "../../src/lib/models/resource-factory";

const listAttachments = vi.fn();
vi.mock("../../src/lib/api/source-attachments", () => ({
  listAttachments: (...a: unknown[]) => listAttachments(...a),
  addAttachment: vi.fn(),
  replaceAttachment: vi.fn(),
  removeAttachment: vi.fn(),
  reorderAttachments: vi.fn(),
}));

const SOURCE = createSourceResource({ name: "Interview" });
const entry = (id: string, originalName: string) => ({
  id,
  fileName: `${id}.png`,
  originalName,
  mime: "image/png",
  size: 2048,
  addedAt: "2026-11-07T00:00:00.000Z",
});

function mount(): ReturnType<typeof render> {
  const store = makeStore();
  store.dispatch(setProject({ id: "p", rootPath: "/test" }));
  store.dispatch(setSelectedProjectId("p"));
  store.dispatch(setResources([SOURCE]));
  const slot = uiModuleRegistry.getAttachmentsSection("sources");
  return render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <SourcesView
          renderAttachments={(resource) => slot?.render({ resource })}
        />
      </TrashRefreshProvider>
    </Provider>,
  );
}

beforeEach(() => {
  listAttachments.mockReset();
  listAttachments.mockResolvedValue([
    entry("a1", "alpha.png"),
    entry("b2", "beta.png"),
  ]);
});

describe("a11y: attachments panel in the Sources view slot", () => {
  it("axe passes with the panel open on a loaded list", async () => {
    const { container } = mount();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Show attachments of Interview",
      }),
    );
    await screen.findByText("alpha.png");
    await runAxe(container);
  });

  it("axe passes with the panel open on an empty list", async () => {
    listAttachments.mockResolvedValue([]);
    const { container } = mount();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Show attachments of Interview",
      }),
    );
    await screen.findByText("No attachments.");
    await runAxe(container);
  });

  it("the toggle and the panel's controls are reached by Tab in order", async () => {
    mount();
    const user = userEvent.setup();
    const toggle = await screen.findByRole("button", {
      name: "Show attachments of Interview",
    });
    await user.click(toggle);
    await screen.findByText("alpha.png");
    expect(toggle).toHaveAccessibleName("Hide attachments of Interview");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    toggle.focus();
    await user.tab();
    const region = document.getElementById(
      toggle.getAttribute("aria-controls") ?? "",
    ) as HTMLElement;
    expect(region).not.toBeNull();
    expect(region.contains(document.activeElement)).toBe(true);
    expect(within(region).getByRole("button", { name: "Add attachment" })).toBe(
      document.activeElement,
    );
  });
});
