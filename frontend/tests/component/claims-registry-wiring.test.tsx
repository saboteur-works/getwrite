/** @vitest-environment jsdom */
/**
 * Feature 108, Task 25 (FR-3, FR-6, FR-14, FR-16): the claims module wired
 * through the UI registry. The Claims tab beside Sources and its fall-back,
 * `ClaimsView` fed by `useClaimList`, opening a claim in the editor, and the
 * editor's "Mark as claim" through the citation-control slot (module gating,
 * writable text resource only, `addClaimFlow`).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  within,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

vi.mock("../../components/Sharing/SharingLimitsContext", () => ({
  useSharingLimits: () => ({
    state: { state: "exempt" },
    hasDesktopBridge: false,
    refresh: async () => ({ state: "exempt" }),
    registerUnlockPrompt: () => () => undefined,
  }),
  useDeclareUnlockPromptMounted: () => undefined,
}));
vi.mock("../../components/WorkArea/EditView", () => ({
  __esModule: true,
  default: () => <div data-testid="view-edit" />,
}));
vi.mock("../../components/WorkArea/Media/MediaView", () => ({
  __esModule: true,
  default: () => <div data-testid="view-media" />,
}));
vi.mock("../../components/WorkArea/DiffViewController", () => ({
  __esModule: true,
  default: () => <div data-testid="view-diff" />,
}));
vi.mock("../../components/WorkArea/Views/OrganizerView/OrganizerView", () => ({
  __esModule: true,
  default: () => <div data-testid="view-organizer" />,
}));
vi.mock("../../components/WorkArea/DataView", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../components/WorkArea/DataView")>();
  return {
    ...actual,
    __esModule: true,
    default: () => <div data-testid="view-data" />,
  };
});
vi.mock("../../components/WorkArea/Views/TrashView/TrashView", () => ({
  __esModule: true,
  default: () => <div data-testid="view-trash" />,
}));
vi.mock("../../src/lib/api/source-attachments", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/lib/api/source-attachments")
    >();
  return { ...actual, listAttachments: vi.fn(async () => []) };
});

const listClaims = vi.fn();
const addClaim = vi.fn();
const updateClaim = vi.fn();
vi.mock("../../src/lib/api/claims", () => ({
  listClaims: (...a: unknown[]) => listClaims(...a),
  addClaim: (...a: unknown[]) => addClaim(...a),
  updateClaim: (...a: unknown[]) => updateClaim(...a),
}));
const listTrash = vi.fn();
vi.mock("../../src/lib/api/trash", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/api/trash")>();
  return { ...actual, listTrash: (...a: unknown[]) => listTrash(...a) };
});
const fetchResourceContent = vi.fn();
vi.mock("../../src/lib/api/resources", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/api/resources")>();
  return {
    ...actual,
    fetchResourceContent: (...a: unknown[]) => fetchResourceContent(...a),
  };
});
vi.mock("../../src/lib/api/annotations", () => ({
  addAnnotation: vi.fn(),
  listAnnotations: vi.fn(async () => []),
  deleteAnnotation: vi.fn(),
}));

import AppShell from "../../components/Layout/AppShell";
import TrashRefreshProvider from "../../components/Layout/TrashRefreshContext";
import CitationControlSlot from "../../components/Editor/Citations/CitationControlSlot";
import { StaticModulesProvider } from "../../components/Modules/ModulesContext";
import {
  setActiveEditor,
  setActiveEditorResourceId,
} from "../../components/Editor/activeEditorRegistry";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import {
  getAnnotationsPanelRequest,
  resetAnnotationsPanelRequestForTests,
} from "../../components/Editor/Annotations/annotationsPanelRequest";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import {
  setFolders,
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import {
  createSourceResource,
  createTextResource,
} from "../../src/lib/models/resource-factory";
import type { Annotation } from "../../src/lib/models/types";
import { setupAppShellFetchStub } from "../helpers/appShellFetchStub";
import { flushPendingEffects } from "../helpers/flushEffects";

const PROJECT_ID = "proj_claims_wiring";
const text = createTextResource({ name: "Scene A", plainText: "" });
const source = createSourceResource({ name: "Source A" });
const project = {
  id: PROJECT_ID,
  name: "Claims Wiring Project",
  rootPath: "/test/claims-wiring",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function claimAnnotation(id: string, statement: string): Annotation {
  return {
    id,
    body: statement,
    quote: "Harbour",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    claim: {
      status: "unverified",
      statusChangedAt: "2026-11-01T00:00:00.000Z",
    },
  };
}

function seed(
  store: ReturnType<typeof makeStore>,
  modules?: Record<string, boolean>,
): void {
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: project.name,
      rootPath: project.rootPath,
      folders: [],
      resources: [],
      features: { timelineView: true, entities: true },
      modules,
    }),
  );
}

async function renderShell(modules?: Record<string, boolean>) {
  const all = [text, source];
  const store = makeStore();
  seed(store, modules);
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  store.dispatch(setFolders([] as never));
  store.dispatch(setResources(all as never));
  store.dispatch(setSelectedResourceId(text.id));
  render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <AppShell
          showSidebars={true}
          project={project as never}
          resources={all}
        />
      </TrashRefreshProvider>
    </Provider>,
  );
  await flushPendingEffects();
  return store;
}

const claimsTab = () => screen.queryByRole("tab", { name: "Claims" });
const isActive = (name: string) =>
  screen.getByRole("tab", { name }).getAttribute("aria-selected") === "true";

beforeEach(() => {
  listClaims.mockReset().mockResolvedValue({ claims: [], failures: [] });
  addClaim.mockReset();
  updateClaim.mockReset();
  listTrash
    .mockReset()
    .mockResolvedValue({ resources: [], folders: [], sourceAttachments: [] });
  fetchResourceContent.mockReset().mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  resetAnnotationsPanelRequestForTests();
  setActiveEditor(null);
  setActiveEditorResourceId(null);
});

describe("Claims tab (FR-3, FR-6, FR-16)", () => {
  setupAppShellFetchStub();

  it("is absent by default (the module is off until switched on)", async () => {
    await renderShell();
    expect(claimsTab()).toBeNull();
  });

  it("appears right after Sources when the module is on", async () => {
    await renderShell({ claims: true });
    const tabs: HTMLElement[] = screen.getAllByRole("tab");
    const names: string[] = tabs.map((t: HTMLElement) => t.textContent ?? "");
    const sources = names.findIndex((n: string) => n.includes("Sources"));
    const claims = names.findIndex((n: string) => n.includes("Claims"));
    expect(sources).toBeGreaterThanOrEqual(0);
    expect(claims).toBe(sources + 1);
  });

  it("renders ClaimsView through useClaimList when opened", async () => {
    listClaims.mockResolvedValue({
      claims: [
        {
          resourceId: text.id,
          resourceName: "Scene A",
          annotation: claimAnnotation("a1", "The harbour froze in 1962."),
          passage: "present",
        },
      ],
      failures: [],
    });
    await renderShell({ claims: true });
    fireEvent.click(screen.getByRole("tab", { name: "Claims" }));
    await flushPendingEffects();
    expect(listClaims).toHaveBeenCalledWith("claims-wiring");
    expect(
      await screen.findByText("The harbour froze in 1962."),
    ).toBeInTheDocument();
    expect(isActive("Claims")).toBe(true);
  });

  it("shows a failed read as a failure, not as no claims", async () => {
    listClaims.mockRejectedValue(new Error("disk unreadable"));
    await renderShell({ claims: true });
    fireEvent.click(screen.getByRole("tab", { name: "Claims" }));
    await flushPendingEffects();
    expect(screen.queryByText("There are no claims.")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("falls back from an open Claims tab when the module is switched off", async () => {
    const store = await renderShell({ claims: true });
    fireEvent.click(screen.getByRole("tab", { name: "Claims" }));
    await flushPendingEffects();
    expect(isActive("Claims")).toBe(true);
    act(() => seed(store, { claims: false }));
    await flushPendingEffects();
    expect(claimsTab()).toBeNull();
    expect(isActive("Edit")).toBe(true);
  });

  it("opening a claim switches to the editor, selects the resource and focuses the passage", async () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: baseSchemaExtensions,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "The " },
              {
                type: "text",
                text: "Harbour",
                marks: [{ type: "annotation", attrs: { id: "a1" } }],
              },
              { type: "text", text: " froze." },
            ],
          },
        ],
      },
    });
    listClaims.mockResolvedValue({
      claims: [
        {
          resourceId: text.id,
          resourceName: "Scene A",
          annotation: claimAnnotation("a1", "The harbour froze in 1962."),
          passage: "present",
        },
      ],
      failures: [],
    });
    fetchResourceContent.mockResolvedValue({
      resourceContent: { tipTapContent: editor.getJSON() },
    });
    const store = await renderShell({ claims: true });
    store.dispatch(setSelectedResourceId(source.id));
    fireEvent.click(screen.getByRole("tab", { name: "Claims" }));
    await flushPendingEffects();
    await screen.findByText("The harbour froze in 1962.");
    setActiveEditor(editor);
    setActiveEditorResourceId(text.id);
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", {
          name: "Open claim: The harbour froze in 1962.",
        }),
      );
    await waitFor(() => expect(isActive("Edit")).toBe(true));
    expect(store.getState().resources.selectedResourceId).toBe(text.id);
    await waitFor(() => {
      const { from, to } = editor.state.selection;
      expect(editor.state.doc.textBetween(from, to)).toBe("Harbour");
    });
    // The annotations panel is asked to open with this claim's row in view.
    // (No TipTapEditor is mounted in this test, so the request stays pending.)
    await waitFor(() =>
      expect(getAnnotationsPanelRequest()).toMatchObject({
        resourceId: text.id,
        annotationId: "a1",
        isPassageMissing: false,
      }),
    );
    editor.destroy();
  });

  it("lists a detached claim as detached and opens its resource and panel with the passage reported missing, selecting nothing", async () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: baseSchemaExtensions,
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "No marks." }] },
        ],
      },
    });
    listClaims.mockResolvedValue({
      claims: [
        {
          resourceId: text.id,
          resourceName: "Scene A",
          annotation: claimAnnotation("a1", "The harbour froze in 1962."),
          passage: "detached",
        },
      ],
      failures: [],
    });
    fetchResourceContent.mockResolvedValue({
      resourceContent: { tipTapContent: editor.getJSON() },
    });
    const store = await renderShell({ claims: true });
    store.dispatch(setSelectedResourceId(source.id));
    fireEvent.click(screen.getByRole("tab", { name: "Claims" }));
    await flushPendingEffects();
    await screen.findByText("The harbour froze in 1962.");
    expect(screen.getByText(/passage is detached/i)).toBeVisible();
    setActiveEditor(editor);
    setActiveEditorResourceId(text.id);
    const before = editor.state.selection.toJSON();
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", {
          name: "Open claim: The harbour froze in 1962.",
        }),
      );
    await waitFor(() => expect(isActive("Edit")).toBe(true));
    expect(store.getState().resources.selectedResourceId).toBe(text.id);
    await waitFor(() =>
      expect(getAnnotationsPanelRequest()).toMatchObject({
        resourceId: text.id,
        annotationId: "a1",
        isPassageMissing: true,
      }),
    );
    expect(editor.state.selection.toJSON()).toEqual(before);
    editor.destroy();
  });

  it("says in text that a passage was not checked when the list could not read its document", async () => {
    listClaims.mockResolvedValue({
      claims: [
        {
          resourceId: text.id,
          resourceName: "Scene A",
          annotation: claimAnnotation("a1", "The harbour froze in 1962."),
          passage: "unknown",
        },
      ],
      failures: [],
    });
    await renderShell({ claims: true });
    fireEvent.click(screen.getByRole("tab", { name: "Claims" }));
    await flushPendingEffects();
    await screen.findByText("The harbour froze in 1962.");
    expect(
      screen.getByText(
        "The passage could not be checked against the document.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/passage is detached/i)).toBeNull();
  });
});

describe("Mark as claim in the editor (FR-14)", () => {
  const editors: Editor[] = [];

  function makeEditor(): Editor {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: baseSchemaExtensions,
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Harbour" }] },
        ],
      },
    });
    editors.push(editor);
    return editor;
  }

  function mount(
    editor: Editor,
    options: {
      modules?: Record<string, boolean>;
      resourceId?: string;
      onStored?: () => void;
      /** Expand every module-control disclosure (default); false leaves them collapsed. */
      open?: boolean;
    } = {},
  ) {
    const store = makeStore();
    store.dispatch(setProject({ id: "p", rootPath: "/test/p" }));
    store.dispatch(setSelectedProjectId("p"));
    store.dispatch(setResources([text, source]));
    const view = render(
      <Provider store={store}>
        <StaticModulesProvider value={options.modules}>
          <CitationControlSlot
            editor={editor}
            resourceId={options.resourceId ?? text.id}
            onStored={options.onStored}
          />
        </StaticModulesProvider>
      </Provider>,
    );
    if (options.open !== false) {
      for (const button of screen.queryAllByRole("button", {
        expanded: false,
      })) {
        if (/^(Cite selection|Mark as claim)$/.test(button.textContent ?? "")) {
          fireEvent.click(button);
        }
      }
    }
    return view;
  }

  /** The form's button inside the "Mark a claim" group, not its disclosure. */
  const markButton = () =>
    within(screen.getByRole("group", { name: "Mark a claim" })).getByRole(
      "button",
      { name: "Mark as claim" },
    );

  function selectAll(editor: Editor): void {
    act(() => {
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, 1, 8),
        ),
      );
    });
  }

  afterEach(() => {
    while (editors.length) editors.pop()?.destroy();
  });

  const markGroup = () => screen.queryByRole("group", { name: "Mark a claim" });
  const citeGroup = () =>
    screen.queryByRole("group", { name: "Cite a Source" });

  it("starts collapsed: Cite selection and Mark as claim are buttons with aria-expanded false and no form", () => {
    mount(makeEditor(), {
      modules: { sources: true, claims: true },
      open: false,
    });
    for (const name of ["Cite selection", "Mark as claim"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
    expect(citeGroup()).toBeNull();
    expect(markGroup()).toBeNull();
    expect(screen.queryByLabelText("Claim statement")).toBeNull();
  });

  it("Mark as claim expands on demand with aria-controls, moves focus into the form, and Escape returns focus to the button", async () => {
    mount(makeEditor(), { modules: { claims: true }, open: false });
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: "Mark as claim" });
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(
      document
        .getElementById(button.getAttribute("aria-controls") ?? "")
        ?.contains(markGroup()),
    ).toBe(true);
    expect(screen.getByLabelText("Claim statement")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(markGroup()).toBeNull();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });

  it("a failed Mark as claim keeps the form open", async () => {
    addClaim.mockRejectedValue(new Error("write refused"));
    const editor = makeEditor();
    selectAll(editor);
    mount(editor, { modules: { claims: true }, open: false });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Mark as claim" }));
    await user.type(screen.getByLabelText("Claim statement"), "It froze.");
    await user.click(markButton());
    await waitFor(() =>
      expect(
        within(markGroup() as HTMLElement).getByRole("status"),
      ).toHaveTextContent(/could not be saved/),
    );
    expect(
      screen.getByRole("button", { name: "Mark as claim", expanded: true }),
    ).toBeTruthy();
  });

  it("shows both Sources' controls and Mark as claim when both modules are on", () => {
    mount(makeEditor(), { modules: { sources: true, claims: true } });
    expect(citeGroup()).not.toBeNull();
    expect(markGroup()).not.toBeNull();
  });

  it("shows Mark as claim alone with Sources off", () => {
    mount(makeEditor(), { modules: { sources: false, claims: true } });
    expect(citeGroup()).toBeNull();
    expect(markGroup()).not.toBeNull();
  });

  it("shows no claims control with the claims module off, and by default", () => {
    mount(makeEditor(), { modules: { sources: true, claims: false } });
    expect(citeGroup()).not.toBeNull();
    expect(markGroup()).toBeNull();
    cleanup();
    mount(makeEditor(), { modules: {} });
    expect(markGroup()).toBeNull();
  });

  it("shows nothing for a resource that is not text", () => {
    mount(makeEditor(), { modules: { claims: true }, resourceId: source.id });
    expect(markGroup()).toBeNull();
  });

  it("shows nothing for a resource the store does not know", () => {
    mount(makeEditor(), {
      modules: { claims: true },
      resourceId: "11111111-1111-4111-8111-111111111111",
    });
    expect(markGroup()).toBeNull();
  });

  it("marks the selection through addClaimFlow: store first, then the mark", async () => {
    addClaim.mockImplementation(
      async (
        _p: string,
        _r: string,
        input: { id: string; statement: string },
      ) => claimAnnotation(input.id, input.statement),
    );
    const onStored = vi.fn();
    const editor = makeEditor();
    selectAll(editor);
    mount(editor, { modules: { claims: true }, onStored });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Claim statement"), "It froze.");
    await user.click(markButton());
    await waitFor(() => expect(addClaim).toHaveBeenCalledTimes(1));
    const [projectId, resourceId, sent] = addClaim.mock.calls[0] as [
      string,
      string,
      { statement: string; quote: string; id: string },
    ];
    expect(projectId).toBe("p");
    expect(resourceId).toBe(text.id);
    expect(sent.statement).toBe("It froze.");
    expect(sent.quote).toBe("Harbour");
    // The form closes after a success; the result stays as a status line
    // beside the disclosure button, which has the focus again.
    await waitFor(() => expect(markGroup()).toBeNull());
    const disclosure = screen.getByRole("button", { name: "Mark as claim" });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(disclosure).toHaveFocus();
    expect(screen.getByText("Marked as a claim.")).toHaveAttribute(
      "role",
      "status",
    );
    expect(JSON.stringify(editor.getJSON())).toContain(sent.id);
    expect(onStored).toHaveBeenCalledTimes(1);
  });

  it("a failed write sets no mark and reports the failure", async () => {
    addClaim.mockRejectedValue(new Error("write refused"));
    const editor = makeEditor();
    selectAll(editor);
    mount(editor, { modules: { claims: true } });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Claim statement"), "It froze.");
    await user.click(markButton());
    await waitFor(() =>
      expect(
        within(markGroup() as HTMLElement).getByRole("status"),
      ).toHaveTextContent(/could not be saved/),
    );
    expect(JSON.stringify(editor.getJSON())).not.toContain('"annotation"');
  });

  it("follows the editor selection: a prompt with none, the passage once selected", async () => {
    const editor = makeEditor();
    mount(editor, { modules: { claims: true } });
    expect(
      screen.getByText("Select the passage you want to mark as a claim."),
    ).toBeTruthy();
    selectAll(editor);
    await waitFor(() => expect(screen.getByText("Harbour")).toBeTruthy());
  });
});
