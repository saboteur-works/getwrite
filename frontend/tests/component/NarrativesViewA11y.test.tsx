/** @vitest-environment jsdom */
/**
 * Feature 110, Task 23 (FR-22): axe and keyboard tests for the Narratives tab
 * (list, picker, comparison). Written after the component, which is committed
 * (Task 20); this task changes no production code, so a failing pin here is a
 * finding. The jsdom `color-contrast` rule is off in `runAxe`; the contrast
 * check of record is the lead's Chromium run, and no screen-reader run was
 * made (recorded in `experiments/task-23.md`).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { makeStore } from "../../src/store/store";
import { StaticSharingLimitsProvider } from "../../components/Sharing/SharingLimitsContext";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setFolders, setResources } from "../../src/store/resourcesSlice";
import NarrativesView from "../../components/Folklore/NarrativesView";
import type { NarrativeListDeps } from "../../components/Folklore/useNarrativeList";
import type { VariantTextsDeps } from "../../components/Folklore/useVariantTexts";
import { ProjectLockedError } from "../../src/lib/models/locked-access";
import { fetchEncryptionStatus } from "../../src/lib/api/encryption";
import { COMPARISON_PHONE_MESSAGE } from "../../src/lib/models/folklore-types";
import type { VariantTextResult } from "../../src/lib/models/folklore-types";
import type {
  AnyResource,
  Folder,
  MetadataSchema,
} from "../../src/lib/models/types";
import { runAxe } from "../a11y/helpers/axe";

vi.mock("../../src/lib/api/encryption", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/api/encryption")>()),
  unlockWorkspaceRequest: vi.fn(),
  fetchEncryptionStatus: vi.fn(),
}));

const PROJECT_DIR = "proj-narr23";

const SCHEMA: MetadataSchema = {
  groups: [
    {
      id: "g",
      label: "Variant",
      fields: [
        {
          key: "teller",
          label: "Teller",
          type: "text",
          appliesTo: ["Variant"],
        },
        {
          key: "motifs",
          label: "Motifs",
          type: "multiselect",
          options: ["D1 | Slipper"],
          appliesTo: ["Variant"],
        },
      ],
    },
  ],
};

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
  order: number,
  subtype: string | undefined = "Variant",
  over: Record<string, unknown> = {},
): AnyResource {
  return {
    id,
    slug: id,
    name: `Telling ${id}`,
    type: "source",
    folderId: "n1",
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

function textDeps(
  byId: Record<string, VariantTextResult | Error> = {},
): VariantTextsDeps {
  return {
    readVariantText: vi.fn(async (_p: string, id: string) => {
      const v = byId[id];
      if (v instanceof Error) throw v;
      return v ?? { kind: "text" as const, text: `Body of ${id}` };
    }),
    listAttachments: vi.fn(async () => []),
  };
}

function setup(opts: {
  folders?: Folder[];
  resources?: AnyResource[];
  subtypes?: Subtypes;
  texts?: VariantTextsDeps;
  openInEditor?: (id: string) => void;
}) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_DIR,
      rootPath: `/projects/${PROJECT_DIR}`,
      name: "P",
      metadataSchema: SCHEMA,
    } as never),
  );
  store.dispatch(setSelectedProjectId(PROJECT_DIR));
  store.dispatch(setFolders(opts.folders ?? [folder("n1", "Cinderella")]));
  store.dispatch(
    setResources(opts.resources ?? [source("s1", 0), source("s2", 1)]),
  );
  const openInEditor = opts.openInEditor ?? vi.fn();
  const view = render(
    <Provider store={store}>
      <StaticSharingLimitsProvider value={{}}>
        <NarrativesView
          openInEditor={openInEditor}
          deps={{
            narratives: narrativeDeps(opts.subtypes ?? { n1: "Narrative" }),
            texts: opts.texts ?? textDeps(),
          }}
        />
      </StaticSharingLimitsProvider>
    </Provider>,
  );
  return { openInEditor, container: view.container };
}

/** jsdom has no `matchMedia`; `matches` true reads as desktop, false as phone. */
function stubViewport(matches: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  window.localStorage.clear();
  stubViewport(true);
  vi.mocked(fetchEncryptionStatus).mockResolvedValue({
    isAvailable: true,
    hasKeyring: true,
    isUnlocked: false,
    encryptedProjectIds: [PROJECT_DIR],
  } as never);
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "matchMedia");
});

/** Presses Tab until `target` has focus; fails if it is never reached. */
async function tabTo(
  user: ReturnType<typeof userEvent.setup>,
  target: HTMLElement,
): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    if (document.activeElement === target) return;
    await user.tab();
  }
  expect(document.activeElement).toBe(target);
}

const TWO_VARIANTS = [
  source("s1", 0, "Variant", {
    userMetadata: { teller: 5, motifs: ["D1 | Slipper", "Z | Stray"] },
  }),
  source("s2", 1, "Variant", { userMetadata: {} }),
];

async function chooseBoth(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("list", { name: "Variants of Cinderella" });
  await user.click(
    screen.getByRole("checkbox", { name: "Select Telling s1 for comparison" }),
  );
  await user.click(
    screen.getByRole("checkbox", { name: "Select Telling s2 for comparison" }),
  );
}

describe("NarrativesView axe", () => {
  it("passes with a narrative open and two variants compared", async () => {
    const user = userEvent.setup();
    const { container } = setup({ resources: TWO_VARIANTS });
    await chooseBoth(user);
    expect(await screen.findByTestId("comparison-columns")).toBeTruthy();
    await runAxe(container);
  });

  it("passes in the empty state", async () => {
    const { container } = setup({
      folders: [folder("f", "Notes")],
      resources: [],
      subtypes: { f: undefined },
    });
    await screen.findByText(/A narrative is a folder/);
    await runAxe(container);
  });

  it("passes with an unreadable folder", async () => {
    const { container } = setup({
      subtypes: { n1: "Narrative", bad: new Error("unreadable") },
      folders: [folder("n1", "Cinderella"), folder("bad", "Broken")],
    });
    await screen.findByText(/Broken: not read/);
    await runAxe(container);
  });

  it("passes in the locked state, with the unlock dialog open", async () => {
    setup({
      subtypes: { n1: new ProjectLockedError(PROJECT_DIR) as unknown as Error },
    });
    await screen.findByText(/project is locked/);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    await runAxe(document.body);
  });

  it("passes with the phone message", async () => {
    stubViewport(false);
    const { container } = setup({ resources: TWO_VARIANTS });
    expect(await screen.findByText(COMPARISON_PHONE_MESSAGE)).toBeTruthy();
    await runAxe(container);
  });
});

describe("NarrativesView keyboard", () => {
  it("reaches and operates the picker, list, selects, open action and column bodies", async () => {
    const user = userEvent.setup();
    const { openInEditor } = setup({ resources: TWO_VARIANTS });
    const picker = await screen.findByRole("combobox", { name: "Narrative" });
    await tabTo(user, picker);
    expect(document.activeElement).toBe(picker);

    const listSelect = screen.getByRole("checkbox", {
      name: "Select Telling s1 for comparison",
    });
    await tabTo(user, listSelect);
    await user.keyboard(" ");
    expect((listSelect as HTMLInputElement).checked).toBe(true);

    const open = screen.getByRole("button", { name: "Open Telling s2" });
    await tabTo(user, open);
    await user.keyboard("{Enter}");
    expect(openInEditor).toHaveBeenCalledWith("s2");

    const compareS2 = screen.getByRole("checkbox", { name: "Telling s2" });
    await tabTo(user, compareS2);
    await user.keyboard(" ");
    await screen.findByTestId("comparison-columns");

    const bodies = screen.getAllByTestId("comparison-column-body");
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(body.getAttribute("tabindex")).toBe("0");
      expect(body.getAttribute("aria-label")).toMatch(/^Text of Telling s/);
      await tabTo(user, body);
      expect(document.activeElement).toBe(body);
    }
    expect(screen.getByRole("region", { name: "Text of Telling s1" })).toBe(
      bodies[0],
    );
  });
});

describe("NarrativesView states in text and live regions", () => {
  it("conveys not set, not in the list and unexpected value in text", async () => {
    const user = userEvent.setup();
    setup({ resources: TWO_VARIANTS });
    const list = await screen.findByRole("list", {
      name: "Variants of Cinderella",
    });
    // Direct children only: a multiselect's tags are nested list items.
    const rows = Array.from(list.children) as HTMLElement[];
    expect(within(rows[0]).getByText(/not in the list/)).toBeTruthy();
    expect(within(rows[0]).getByText(/unexpected value/)).toBeTruthy();
    expect(within(rows[1]).getAllByText("not set")).toHaveLength(2);
    await user.click(
      screen.getByRole("checkbox", {
        name: "Select Telling s1 for comparison",
      }),
    );
    const column = await screen.findByRole("region", {
      name: "Text of Telling s1",
    });
    const section = column.closest("section") as HTMLElement;
    expect(
      within(section).getByText(/Z \| Stray \(not in the list\)/),
    ).toBeTruthy();
    expect(within(section).getByText(/unexpected value/)).toBeTruthy();
  });

  it("conveys not a Variant and unreadable rows in text", async () => {
    setup({
      resources: [
        source("s1", 0),
        source("s2", 1, "Other"),
        source("s3", 2, "Variant", { userMetadata: ["bad"] }),
      ],
    });
    expect(await screen.findByText(/not a Variant/)).toBeTruthy();
    expect(screen.getByText(/Unreadable:/)).toBeTruthy();
  });

  it("conveys no text and unreadable in text, the latter in an alert", async () => {
    const user = userEvent.setup();
    setup({
      texts: textDeps({
        s1: { kind: "none" },
        s2: { kind: "unreadable", reason: "disk failed" },
      }),
    });
    await chooseBoth(user);
    const s1 = await screen.findByRole("region", {
      name: "Text of Telling s1",
    });
    const s2 = screen.getByRole("region", { name: "Text of Telling s2" });
    expect(within(s1).getByText("No text")).toBeTruthy();
    const alert = within(s2).getByRole("alert");
    expect(alert.textContent).toContain("could not be read. disk failed");
  });

  it("puts a locked comparison read in a status", async () => {
    const user = userEvent.setup();
    setup({
      texts: textDeps({
        s1: new ProjectLockedError(PROJECT_DIR) as unknown as Error,
        s2: new ProjectLockedError(PROJECT_DIR) as unknown as Error,
      }),
    });
    await chooseBoth(user);
    const status = await screen.findByText(/the variants cannot be shown/);
    expect(status.getAttribute("role")).toBe("status");
  });

  it("puts loading in a status and an incomplete list in an alert", async () => {
    setup({
      folders: [folder("f", "Tales"), folder("g", "Broken")],
      resources: [],
      subtypes: { f: "Other", g: new Error("disk") },
    });
    expect(screen.getByRole("status").textContent).toContain("Loading");
    const alerts = await screen.findAllByRole("alert");
    expect(
      alerts.some((a: HTMLElement) =>
        /may be incomplete/.test(a.textContent ?? ""),
      ),
    ).toBe(true);
  });
});
