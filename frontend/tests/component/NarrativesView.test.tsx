/** @vitest-environment jsdom */
/**
 * Feature 110, Task 20 (FR-6, FR-7, FR-8, FR-12, FR-19, FR-22): the
 * Narratives tab. Written after the component (order inverted: the props of
 * the committed pieces had to be read first). Task 36: variants are chosen
 * only in the list; "Compare (N)" opens the comparison, "Back to list" returns.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "../../src/store/store";
import { StaticSharingLimitsProvider } from "../../components/Sharing/SharingLimitsContext";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setFolders, setResources } from "../../src/store/resourcesSlice";
import NarrativesView, {
  toComparisonVariants,
  toListItems,
} from "../../components/Folklore/NarrativesView";
import type { NarrativeListDeps } from "../../components/Folklore/useNarrativeList";
import type { VariantListRow } from "../../components/Folklore/useVariantList";
import type { VariantTextsDeps } from "../../components/Folklore/useVariantTexts";
import { ProjectLockedError } from "../../src/lib/models/locked-access";
import { fetchEncryptionStatus } from "../../src/lib/api/encryption";
import {
  readFolkloreSelection,
  writeFolkloreSelection,
} from "../../src/lib/folklore-selection-preference";
import type { AnyResource, Folder } from "../../src/lib/models/types";

vi.mock("../../src/lib/api/encryption", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/api/encryption")>()),
  unlockWorkspaceRequest: vi.fn(),
  fetchEncryptionStatus: vi.fn(),
}));

const PROJECT_DIR = "proj-narr20";

function folder(id: string, name: string, order = 0): Folder {
  return {
    id,
    name,
    slug: id,
    type: "folder",
    orderIndex: order,
    parentId: null,
  } as unknown as Folder;
}

function source(
  id: string,
  folderId: string,
  order: number,
  subtype: string | undefined = "Variant",
  over: Record<string, unknown> = {},
): AnyResource {
  return {
    id,
    slug: id,
    name: `Telling ${id}`,
    type: "source",
    folderId,
    orderIndex: order,
    resourceSubtype: subtype,
    ...over,
  } as unknown as AnyResource;
}

type Subtypes = Record<string, string | undefined | Error>;

function narrativeDeps(subtypes: Subtypes): NarrativeListDeps {
  return {
    getFolderMetadata: vi.fn(async (_p: string, id: string) => {
      const v = subtypes[id];
      if (v instanceof Error) throw v;
      return { notes: "", fieldValues: {}, resourceSubtype: v };
    }),
  };
}

function textDeps(): VariantTextsDeps {
  return {
    readVariantText: vi.fn(async (_p: string, id: string) => ({
      kind: "text" as const,
      text: `Body of ${id}`,
    })),
    listAttachments: vi.fn(async () => []),
  };
}

function setup(opts: {
  folders: Folder[];
  resources?: AnyResource[];
  subtypes: Subtypes;
  texts?: VariantTextsDeps;
  openInEditor?: (id: string) => void;
}) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_DIR,
      rootPath: `/projects/${PROJECT_DIR}`,
      name: "P",
    }),
  );
  store.dispatch(setSelectedProjectId(PROJECT_DIR));
  store.dispatch(setFolders(opts.folders));
  store.dispatch(setResources(opts.resources ?? []));
  const openInEditor = opts.openInEditor ?? vi.fn();
  const nDeps = narrativeDeps(opts.subtypes);
  render(
    <Provider store={store}>
      <StaticSharingLimitsProvider value={{}}>
        <NarrativesView
          openInEditor={openInEditor}
          deps={{ narratives: nDeps, texts: opts.texts ?? textDeps() }}
        />
      </StaticSharingLimitsProvider>
    </Provider>,
  );
  return { store, openInEditor, nDeps };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(fetchEncryptionStatus).mockResolvedValue({
    isAvailable: true,
    hasKeyring: true,
    isUnlocked: false,
    encryptedProjectIds: [PROJECT_DIR],
  } as never);
});
afterEach(() => cleanup());

const NARRATIVE = {
  folders: [folder("n1", "Cinderella", 0)],
  resources: [source("s1", "n1", 0), source("s2", "n1", 1)],
  subtypes: { n1: "Narrative" } as Subtypes,
};

describe("NarrativesView structure and states", () => {
  it("is a labelled section with an h2 and shows loading as a status", () => {
    setup(NARRATIVE);
    const section = screen.getByRole("region", { name: "Narratives" });
    expect(within(section).getByRole("heading", { level: 2 })).toBeTruthy();
    expect(within(section).getByRole("status").textContent).toContain(
      "Loading narratives",
    );
  });

  it("lists Narrative folders by name with variant counts in the picker", async () => {
    setup({
      folders: [folder("n1", "Cinderella", 0), folder("n2", "Snow", 1)],
      resources: [source("s1", "n1", 0), source("s2", "n1", 1)],
      subtypes: { n1: "Narrative", n2: "narrative" },
    });
    const picker = await screen.findByLabelText("Narrative");
    const options = within(picker).getAllByRole("option");
    expect(options.map((o: HTMLElement) => o.textContent)).toEqual([
      "Cinderella (2 variants)",
      "Snow (0 variants)",
    ]);
  });

  it("states what a narrative is, with no action, when none exists", async () => {
    setup({ folders: [folder("f", "Notes")], subtypes: { f: undefined } });
    expect(await screen.findByText(/A narrative is a folder/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("names the other subtypes when folders carry them (near miss)", async () => {
    setup({ folders: [folder("f", "Tales")], subtypes: { f: "Narratve" } });
    expect(await screen.findByText(/other subtypes: Narratve/)).toBeTruthy();
  });

  it("shows an incomplete near-miss as a failure", async () => {
    setup({
      folders: [folder("f", "Tales"), folder("g", "Broken")],
      subtypes: { f: "Other", g: new Error("disk") },
    });
    const alerts = await screen.findAllByRole("alert");
    expect(
      alerts.some((a: HTMLElement) =>
        /may be incomplete/.test(a.textContent ?? ""),
      ),
    ).toBe(true);
  });

  it("names folders not read with a retry while read narratives stay shown", async () => {
    const { nDeps } = setup({
      folders: [folder("n1", "Cinderella"), folder("bad", "Broken")],
      resources: [source("s1", "n1", 0)],
      subtypes: { n1: "Narrative", bad: new Error("unreadable") },
    });
    const alert = await screen.findByText(/Broken: not read/);
    expect(screen.getByLabelText("Narrative")).toBeTruthy();
    const calls = vi.mocked(nDeps.getFolderMetadata).mock.calls.length;
    fireEvent.click(
      within(alert.closest("[role=alert]") as HTMLElement).getByRole("button", {
        name: "Try again",
      }),
    );
    await waitFor(() =>
      expect(
        vi.mocked(nDeps.getFolderMetadata).mock.calls.length,
      ).toBeGreaterThan(calls),
    );
  });

  it("opens the unlock prompt for a locked project", async () => {
    setup({
      folders: [folder("n1", "Cinderella")],
      subtypes: { n1: new ProjectLockedError(PROJECT_DIR) as unknown as Error },
    });
    // The modal hides the rest of the page from the accessibility tree.
    expect(await screen.findByText(/project is locked/)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
  });
});

describe("NarrativesView list, comparison and open", () => {
  it("shows the list and opens a variant in the editor", async () => {
    const { openInEditor } = setup(NARRATIVE);
    const list = await screen.findByRole("list", {
      name: "Variants of Cinderella",
    });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Open Telling s2" }));
    expect(openInEditor).toHaveBeenCalledWith("s2");
  });

  it("marks a Source that is not a Variant and an unreadable row", async () => {
    setup({
      ...NARRATIVE,
      resources: [
        source("s1", "n1", 0),
        source("s2", "n1", 1, "Other"),
        source("s3", "n1", 2, "Variant", { userMetadata: ["bad"] }),
      ],
    });
    expect(await screen.findByText(/not a Variant/)).toBeTruthy();
    expect(screen.getByText(/Unreadable:/)).toBeTruthy();
  });

  const tick = (name: string): void => {
    fireEvent.click(
      screen.getByRole("checkbox", { name: `Select ${name} for comparison` }),
    );
  };

  it("has no 'Variants to compare' group; variants are chosen only in the list", async () => {
    setup(NARRATIVE);
    await screen.findByRole("list", { name: "Variants of Cinderella" });
    tick("Telling s1");
    expect(
      screen.queryByRole("group", { name: "Variants to compare" }),
    ).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(readFolkloreSelection(PROJECT_DIR)).toMatchObject({
      status: "stored",
      selection: { narrativeId: "n1", variantIds: ["s1"] },
    });
  });

  it("shows Compare (N) with the count, enabled only at two or more", async () => {
    setup(NARRATIVE);
    await screen.findByRole("list", { name: "Variants of Cinderella" });
    const button = screen.getByRole("button", { name: "Compare (0)" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    tick("Telling s1");
    expect(
      (screen.getByRole("button", { name: "Compare (1)" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    tick("Telling s2");
    expect(
      (screen.getByRole("button", { name: "Compare (2)" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("switches to the comparison, reading the chosen texts, and Back keeps the ticks", async () => {
    const texts = textDeps();
    setup({ ...NARRATIVE, texts });
    await screen.findByRole("list", { name: "Variants of Cinderella" });
    tick("Telling s1");
    tick("Telling s2");
    fireEvent.click(screen.getByRole("button", { name: "Compare (2)" }));

    expect(await screen.findByTestId("comparison-columns")).toBeTruthy();
    expect(
      screen.queryByRole("list", { name: "Variants of Cinderella" }),
    ).toBeNull();
    await waitFor(() =>
      expect(texts.readVariantText).toHaveBeenCalledWith(PROJECT_DIR, "s2"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));
    await screen.findByRole("list", { name: "Variants of Cinderella" });
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Select Telling s1 for comparison",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Select Telling s2 for comparison",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it("moves focus to the comparison heading, then back to the Compare button", async () => {
    setup(NARRATIVE);
    await screen.findByRole("list", { name: "Variants of Cinderella" });
    tick("Telling s1");
    tick("Telling s2");
    fireEvent.click(screen.getByRole("button", { name: "Compare (2)" }));
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 3, name: "Comparing 2 variants" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Compare (2)" }),
      ),
    );
  });

  it("does not remember the comparison mode: a new mount shows the list with the ticks", async () => {
    writeFolkloreSelection(PROJECT_DIR, {
      narrativeId: "n1",
      variantIds: ["s1", "s2"],
    });
    setup(NARRATIVE);
    await screen.findByRole("list", { name: "Variants of Cinderella" });
    expect(screen.queryByTestId("comparison-columns")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Compare (2)" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("writes only the selection when ticks change, never on Compare or Back", async () => {
    setup(NARRATIVE);
    await screen.findByRole("list", { name: "Variants of Cinderella" });
    tick("Telling s1");
    tick("Telling s2");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    fireEvent.click(screen.getByRole("button", { name: "Compare (2)" }));
    await screen.findByTestId("comparison-columns");
    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));
    await screen.findByRole("list", { name: "Variants of Cinderella" });
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it("says in text when a remembered variant is no longer in the narrative", async () => {
    writeFolkloreSelection(PROJECT_DIR, {
      narrativeId: "n1",
      variantIds: ["s1", "gone"],
    });
    setup(NARRATIVE);
    await screen.findByRole("list", { name: "Variants of Cinderella" });
    expect(screen.getByText(/1 remembered variant is no longer/)).toBeTruthy();
  });

  it("shows the phone message and no Compare button below 768px", async () => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    const texts = textDeps();
    try {
      setup({ ...NARRATIVE, texts });
      await screen.findByRole("list", { name: "Variants of Cinderella" });
      // useViewportTier corrects to the real tier in an effect after mount.
      expect(
        await screen.findByText(/Side-by-side comparison needs a wider screen/),
      ).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Compare/ })).toBeNull();
      expect(texts.readVariantText).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });

  it("writes nothing to storage on open", async () => {
    setup(NARRATIVE);
    await screen.findByRole("list", { name: "Variants of Cinderella" });
    expect(readFolkloreSelection(PROJECT_DIR).status).not.toBe("stored");
  });
});

describe("NarrativesView remembered narrative", () => {
  const TWO = {
    folders: [folder("n1", "Cinderella", 0), folder("n2", "Snow", 1)],
    resources: [source("s1", "n1", 0), source("s3", "n2", 0)],
    subtypes: { n1: "Narrative", n2: "Narrative" } as Subtypes,
  };

  it("restores the picked narrative and its variants on open", async () => {
    writeFolkloreSelection(PROJECT_DIR, {
      narrativeId: "n2",
      variantIds: ["s3"],
    });
    setup(TWO);
    await screen.findByRole("list", { name: "Variants of Snow" });
    expect(
      (screen.getByLabelText("Narrative") as HTMLSelectElement).value,
    ).toBe("n2");
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Select Telling s3 for comparison",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it("writes the narrative only when the writer changes the pick", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    setup(TWO);
    await screen.findByRole("list", { name: "Variants of Cinderella" });
    expect(setItem).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Narrative"), {
      target: { value: "n2" },
    });
    await screen.findByRole("list", { name: "Variants of Snow" });
    expect(readFolkloreSelection(PROJECT_DIR)).toMatchObject({
      status: "stored",
      selection: { narrativeId: "n2", variantIds: [] },
    });
    setItem.mockRestore();
  });

  it("shows in text that the remembered narrative is gone and shows the first", async () => {
    writeFolkloreSelection(PROJECT_DIR, {
      narrativeId: "gone",
      variantIds: ["s1"],
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    setup(TWO);
    await screen.findByRole("list", { name: "Variants of Cinderella" });
    expect(screen.getByText(/narrative you chose before/i)).toBeTruthy();
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it("does not throw when storage fails, and writes nothing to project.json", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    setup(TWO);
    expect(
      await screen.findByRole("list", { name: "Variants of Cinderella" }),
    ).toBeTruthy();
    expect(screen.queryByText(/narrative you chose before/i)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe("row mapping", () => {
  it("maps not-variant to not-a-variant and drops unreadable from comparison", () => {
    const rows: VariantListRow[] = [
      { kind: "variant", id: "a", name: "A", fields: [] },
      {
        kind: "not-variant",
        id: "b",
        name: "B",
        mark: "not a Variant: teller, date and place do not apply",
        selectable: true,
      },
      { kind: "unreadable", id: "c", name: "C", reason: "bad" },
    ];
    expect(toListItems(rows).map((i) => i.kind)).toEqual([
      "variant",
      "not-a-variant",
      "unreadable",
    ]);
    expect(toComparisonVariants(rows).map((v) => v.id)).toEqual(["a", "b"]);
  });
});
