/** @vitest-environment jsdom */
/**
 * Feature 108, Task 24 (FR-6, FR-11, FR-13, FR-15): the annotations panel
 * renders a claim as a `ClaimRow` with the module on, writes through the
 * update-claim client (non-optimistic), offers relink only while Sources is
 * on, and shows a claim as an ordinary note with the claims module off.
 * Everything is faked: no route, no native backend, no device.
 */
import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import AnnotationsPanel from "../../components/Editor/Annotations/AnnotationsPanel";
import { StaticModulesProvider } from "../../components/Modules/ModulesContext";
import {
  StaticSharingLimitsProvider,
  type StaticSharingLimitsValue,
} from "../../components/Sharing/SharingLimitsContext";
import { PERMANENT_DELETION_LIMITED_REASON } from "../../components/Sharing/sharing-copy";
import type { ClaimFlowApi } from "../../src/lib/claim-flows";
import type { Annotation, AnyResource } from "../../src/lib/models/types";
import type { AnnotationsHandle } from "../../src/hooks/useAnnotations";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setResources } from "../../src/store/resourcesSlice";
import { makeEditor, makeHandle } from "../helpers/annotations-panel-harness";
import { runAxe } from "../a11y/helpers/axe";

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const FACTS = {
  listTrash: () => Promise.resolve({ resources: [], folders: [] }),
  listAttachments: () => Promise.resolve([]),
  listAnnotations: () => Promise.resolve([]),
};

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
  vi.clearAllMocks();
});

function claim(id: string, overrides: Partial<Annotation> = {}): Annotation {
  return {
    id,
    body: "The harbour opened in 1902.",
    quote: "hello",
    createdAt: "t",
    updatedAt: "t",
    claim: {
      status: "unverified",
      statusChangedAt: "2026-11-05T12:00:00.000Z",
    },
    ...overrides,
  };
}

type FakeApi = ClaimFlowApi & { update: ReturnType<typeof vi.fn> };

function fakeApi(): FakeApi {
  return {
    add: vi.fn(),
    update: vi.fn().mockImplementation(async () => claim("a")),
  };
}

function storeWithSource(): ReturnType<typeof makeStore> {
  const store = makeStore();
  store.dispatch(
    setProject({ id: "p", name: "P", rootPath: "/p/dir-1" } as never),
  );
  store.dispatch(setSelectedProjectId("p"));
  store.dispatch(
    setResources([
      {
        id: SOURCE_ID,
        slug: "interview",
        name: "Interview with Ada",
        type: "source",
        orderIndex: 0,
      } as AnyResource,
    ]),
  );
  return store;
}

interface Options {
  annotations: Annotation[];
  modules?: Record<string, boolean>;
  limits?: StaticSharingLimitsValue;
  api?: FakeApi;
}

function renderPanel(options: Options): {
  handle: AnnotationsHandle;
  api: FakeApi;
  editor: Editor;
  container: HTMLElement;
} {
  const editor = makeEditor();
  editors.push(editor);
  const handle = makeHandle({ status: "ok", annotations: options.annotations });
  const api = options.api ?? fakeApi();
  const { container } = render(
    <Provider store={storeWithSource()}>
      <StaticModulesProvider value={options.modules ?? { claims: true }}>
        <StaticSharingLimitsProvider value={options.limits}>
          <AnnotationsPanel
            editor={editor}
            handle={handle}
            panelId="panel"
            onClose={vi.fn()}
            resourceId="r1"
            claimApi={api}
            citationFactsDeps={FACTS}
          />
        </StaticSharingLimitsProvider>
      </StaticModulesProvider>
    </Provider>,
  );
  return { handle, api, editor, container };
}

const PROJECT_ID = "dir-1";

describe("AnnotationsPanel claim rows (module on)", () => {
  it("renders a claim as a ClaimRow and never as a plain note", () => {
    renderPanel({ annotations: [claim("a")] });
    const row = screen.getByTestId("claim-row");
    expect(row).toHaveTextContent("The harbour opened in 1902.");
    expect(within(row).getByText("Claim")).toBeInTheDocument();
    expect(screen.queryByTestId("annotation-row")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit note" })).toBeNull();
  });

  it("renders a non-claim annotation as before beside a claim", () => {
    const plain: Annotation = {
      id: "d",
      body: "Orphan note",
      quote: "gone",
      createdAt: "t",
      updatedAt: "t",
    };
    renderPanel({ annotations: [claim("a"), plain] });
    expect(screen.getAllByTestId("claim-row")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Edit note" })).toBeVisible();
  });

  it("changes status through the update-claim client once and then shows the stored value", async () => {
    const api = fakeApi();
    api.update.mockResolvedValue(
      claim("a", {
        claim: {
          status: "verified",
          statusChangedAt: "2026-11-11T09:00:00.000Z",
        },
      }),
    );
    renderPanel({ annotations: [claim("a")], api });
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "verified" },
    });
    // Non-optimistic: nothing changes before the write resolves.
    expect(screen.getByLabelText("Status")).toHaveValue("unverified");
    await waitFor(() =>
      expect(screen.getByLabelText("Status")).toHaveValue("verified"),
    );
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith(PROJECT_ID, "r1", "a", {
      status: "verified",
    });
  });

  it("shows a failed status write in text and leaves the shown value as it was", async () => {
    const api = fakeApi();
    api.update.mockRejectedValue(new Error("Disk is read-only."));
    renderPanel({ annotations: [claim("a")], api });
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "disputed" },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Disk is read-only.",
    );
    expect(screen.getByLabelText("Status")).toHaveValue("unverified");
    expect(api.update).toHaveBeenCalledTimes(1);
  });

  it("saves a changed statement through the client, shows the stored text and returns focus", async () => {
    const api = fakeApi();
    api.update.mockResolvedValue(claim("a", { body: "Opened in 1903." }));
    renderPanel({ annotations: [claim("a")], api });
    fireEvent.click(screen.getByRole("button", { name: "Edit statement" }));
    fireEvent.change(screen.getByLabelText("Claim statement"), {
      target: { value: "Opened in 1903." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save statement" }));
    await waitFor(() =>
      expect(screen.getByTestId("claim-row")).toHaveTextContent(
        "Opened in 1903.",
      ),
    );
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith(PROJECT_ID, "r1", "a", {
      statement: "Opened in 1903.",
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit statement" })).toBe(
        document.activeElement,
      ),
    );
  });

  it("keeps the statement form open and shows the failure text when the save fails", async () => {
    const api = fakeApi();
    api.update.mockRejectedValue(new Error("Could not save."));
    renderPanel({ annotations: [claim("a")], api });
    fireEvent.click(screen.getByRole("button", { name: "Edit statement" }));
    fireEvent.change(screen.getByLabelText("Claim statement"), {
      target: { value: "Changed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save statement" }));
    expect(await screen.findByText("Could not save.")).toBeVisible();
    expect(screen.getByLabelText("Claim statement")).toHaveValue("Changed");
  });
});

describe("AnnotationsPanel Source link", () => {
  it("offers Link Source while Sources is on", () => {
    renderPanel({
      annotations: [claim("a")],
      modules: { claims: true, sources: true },
    });
    expect(screen.getByRole("button", { name: "Link Source" })).toBeVisible();
  });

  it("does not offer Link Source with Sources off", () => {
    renderPanel({
      annotations: [claim("a")],
      modules: { claims: true, sources: false },
    });
    expect(screen.queryByRole("button", { name: "Link Source" })).toBeNull();
  });

  it("links a chosen Source with its name through the update-claim client", async () => {
    const api = fakeApi();
    api.update.mockResolvedValue(
      claim("a", {
        target: { sourceId: SOURCE_ID, sourceName: "Interview with Ada" },
      }),
    );
    renderPanel({
      annotations: [claim("a")],
      modules: { claims: true, sources: true },
      api,
    });
    fireEvent.click(screen.getByRole("button", { name: "Link Source" }));
    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: SOURCE_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Source" }));
    await waitFor(() =>
      expect(screen.getByTestId("claim-source")).toHaveTextContent(
        "Interview with Ada",
      ),
    );
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith(PROJECT_ID, "r1", "a", {
      target: { sourceId: SOURCE_ID, sourceName: "Interview with Ada" },
    });
  });

  it("offers No Source and clears the link with a null target", async () => {
    const api = fakeApi();
    api.update.mockResolvedValue(claim("a"));
    renderPanel({
      annotations: [
        claim("a", {
          target: { sourceId: SOURCE_ID, sourceName: "Interview with Ada" },
        }),
      ],
      modules: { claims: true, sources: true },
      api,
    });
    fireEvent.click(screen.getByRole("button", { name: "Change Source" }));
    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Source" }));
    await waitFor(() =>
      expect(screen.getByTestId("claim-source")).toHaveTextContent("unsourced"),
    );
    expect(api.update).toHaveBeenCalledWith(PROJECT_ID, "r1", "a", {
      target: null,
    });
  });

  it("shows a failed relink in text and keeps the link as it was", async () => {
    const api = fakeApi();
    api.update.mockRejectedValue(new Error("Source not found."));
    renderPanel({
      annotations: [claim("a")],
      modules: { claims: true, sources: true },
      api,
    });
    fireEvent.click(screen.getByRole("button", { name: "Link Source" }));
    fireEvent.change(screen.getByLabelText("Source"), {
      target: { value: SOURCE_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Source" }));
    expect(await screen.findByText("Source not found.")).toBeVisible();
    expect(screen.getByTestId("claim-source")).toHaveTextContent("unsourced");
  });
});

describe("AnnotationsPanel with the claims module off", () => {
  it("renders the claim as an ordinary note and edits the body through the note update", async () => {
    const api = fakeApi();
    const stored = claim("a", {
      target: { sourceId: SOURCE_ID, sourceName: "Interview with Ada" },
    });
    const { handle } = renderPanel({
      annotations: [stored],
      modules: { claims: false },
      api,
    });
    expect(screen.queryByTestId("claim-row")).toBeNull();
    expect(screen.queryByText("Claim")).toBeNull();
    expect(screen.queryByLabelText("Status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    fireEvent.change(screen.getByLabelText("Note text"), {
      target: { value: "Rewritten body" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() =>
      expect(handle.update).toHaveBeenCalledWith("a", "Rewritten body"),
    );
    // No claim or target change is made: the claim client is never called.
    expect(api.update).not.toHaveBeenCalled();
  });

  it("renders as an ordinary note when the module is not declared at all", () => {
    renderPanel({ annotations: [claim("a")], modules: {} });
    expect(screen.queryByTestId("claim-row")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit note" })).toBeVisible();
  });
});

describe("AnnotationsPanel claim Re-attach and Delete", () => {
  it("re-attaches a detached claim to the selection", async () => {
    const { handle, editor } = renderPanel({
      annotations: [claim("d", { quote: "gone passage" })],
    });
    expect(screen.getByTestId("claim-row")).toHaveAttribute(
      "data-detached",
      "true",
    );
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 6 });
    });
    const button = screen.getByRole("button", {
      name: "Re-attach claim to selected text",
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() =>
      expect(handle.reattach).toHaveBeenCalledWith("d", { from: 1, to: 6 }),
    );
  });

  it("deletes a claim only after the confirmation, through the existing delete", async () => {
    const { handle } = renderPanel({ annotations: [claim("a")] });
    fireEvent.click(screen.getByRole("button", { name: "Delete claim" }));
    expect(handle.remove).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Delete/ }));
    await waitFor(() => expect(handle.remove).toHaveBeenCalledWith("a"));
  });

  it("disables Delete with its visible reason under the permanent-deletion limit", () => {
    renderPanel({
      annotations: [claim("a")],
      limits: {
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
      },
    });
    expect(screen.getByRole("button", { name: "Delete claim" })).toBeDisabled();
    expect(screen.getByText(PERMANENT_DELETION_LIMITED_REASON)).toBeVisible();
  });
});

describe("AnnotationsPanel claims axe", () => {
  it("has no axe violations with a claim and its Source picker open", async () => {
    const { container } = renderPanel({
      annotations: [claim("a")],
      modules: { claims: true, sources: true },
    });
    fireEvent.click(screen.getByRole("button", { name: "Link Source" }));
    expect(screen.getByLabelText("Source")).toBeVisible();
    await runAxe(container, ["region"]);
  });
});
