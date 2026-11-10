/**
 * Feature 101, Task 28 (FR-29): both PDF compile entry paths, the AppShell
 * "Compile Project" menu item and the Start Page "Package" menu item, produce
 * a PDF when the runtime is native. No control is added to either path.
 *
 * What is real: `createTransport`'s native branch (selected by
 * `NEXT_PUBLIC_GETWRITE_RUNTIME=native`), `resolveCompileTransport`,
 * `createNativeCompileTransport` with its default (no injected `fs`) runner,
 * `compilePdfCore`, `renderPdfInBrowser`, the real `CompilePreviewModal`, and
 * `runCompileAndDownload`.
 *
 * What is mocked: `native-bootstrap` (it binds a fake in-memory Capacitor
 * filesystem as the default storage context instead of `@capacitor/filesystem`),
 * `@react-pdf/renderer` (the package's browser build, as Task 26 does, so the
 * browser render path runs in this jsdom project), and `downloadFile` (the
 * bytes handed to it are what is asserted; the native file writer is not run).
 *
 * Not shown: a real Android WebView or device, the real Capacitor filesystem,
 * fonts on a device (FR-30), or the native file-save step.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";

const downloaded = vi.hoisted(() => ({
  calls: [] as Array<{ blob: Blob; filename: string }>,
}));

vi.mock("@react-pdf/renderer", async () => {
  return await import("@react-pdf/renderer/lib/react-pdf.browser.js");
});
vi.mock("../../src/lib/compile/download-file", () => ({
  downloadFile: async (blob: Blob, filename: string) => {
    downloaded.calls.push({ blob, filename });
    return { kind: "browser-download" };
  },
}));
vi.mock("../../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));
// Feature 107: AppShell mounts the share host on native; the real plugin
// cannot register in jsdom, so its listener is faked inert here.
vi.mock("../../src/lib/api/share-in", () => ({
  startShareListener: async () => ({ stop: async () => undefined }),
}));
vi.mock("../../src/lib/models/native-bootstrap", async () => {
  const { createFakeCapacitorFilesystem } =
    await import("../../src/lib/models/capacitor-filesystem");
  const { capacitorFsAdapter } =
    await import("../../src/lib/models/capacitorFsAdapter");
  const { setDefaultStorageContext } =
    await import("../../src/lib/models/storage-context");
  const adapter = capacitorFsAdapter(createFakeCapacitorFilesystem());
  const ensure = async (): Promise<void> => {
    setDefaultStorageContext({ tenantRoot: "/projects", adapter });
  };
  return {
    ensureNativeStorageContext: ensure,
    bootstrapNativeStorageContext: ensure,
    __resetNativeBootstrapForTests: () => {},
  };
});

import AppShell from "../../components/Layout/AppShell";
import StartPage, {
  type StartPageProjectEntry,
} from "../../components/Start/StartPage";
import SharingLimitsProvider from "../../components/Sharing/SharingLimitsContext";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setResources } from "../../src/store/resourcesSlice";
import { createTextResource } from "../../src/lib/models/resource";
import { buildProjectView } from "../../src/lib/models/project-view";
import { getStorageContext } from "../../src/lib/models/storage-context";
import { setupAppShellFetchStub } from "../helpers/appShellFetchStub";
import { checkPdfValidity, extractPdfPageTexts } from "../helpers/pdf-text";

const DIR_ID = "af142f76-0000-4000-8000-00000000d1d1";
const STAMP = "2026-01-01T00:00:00.000Z";
const BODY_ONE = "The lighthouse keeper counted the ships at dusk.";
const BODY_TWO = "Morning brought fog and a single bell.";

/** The mocked bootstrap binds one shared fake filesystem; seed the files it will serve. */
async function seedProject(
  files: Array<{ id: string; text: string }>,
): Promise<void> {
  const { ensureNativeStorageContext } =
    await import("../../src/lib/models/native-bootstrap");
  await ensureNativeStorageContext();
  const context = getStorageContext();
  if (!context) throw new Error("storage context was not bound");
  for (const f of files) {
    const base = `${context.tenantRoot}/${DIR_ID}/resources/${f.id}`;
    await context.adapter.mkdir(base, { recursive: true });
    await context.adapter.writeFile(`${base}/content.txt`, f.text);
    await context.adapter.writeFile(
      `${base}/content.tiptap.json`,
      JSON.stringify({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: f.text }] },
        ],
      }),
    );
  }
}

async function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function expectPdfOf(...texts: string[]): Promise<void> {
  await waitFor(() => expect(downloaded.calls).toHaveLength(1), {
    timeout: 20000,
  });
  const { blob, filename } = downloaded.calls[0];
  expect(filename.endsWith(".pdf")).toBe(true);
  const bytes = await blobBytes(blob);
  expect(Buffer.from(bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect((await checkPdfValidity(bytes)).valid).toBe(true);
  const text = (await extractPdfPageTexts(bytes)).join("\n");
  for (const t of texts) expect(text).toContain(t);
}

beforeEach(() => {
  downloaded.calls.length = 0;
  vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PDF compile on native, AppShell path (Feature 101, FR-29)", () => {
  setupAppShellFetchStub();

  it("Compile Project with the native transport produces a PDF", async () => {
    const one = createTextResource({
      name: "Chapter One",
      plainText: BODY_ONE,
    });
    const two = createTextResource({
      name: "Chapter Two",
      plainText: BODY_TWO,
    });
    await seedProject([
      { id: one.id, text: BODY_ONE },
      { id: two.id, text: BODY_TWO },
    ]);
    const rootPath = `/projects/${DIR_ID}`;
    const project = {
      id: "internal-id",
      name: "Native Novel",
      rootPath,
      createdAt: STAMP,
      updatedAt: STAMP,
    };
    const store = makeStore();
    store.dispatch(
      setProject({
        id: "internal-id",
        name: project.name,
        rootPath,
        folders: [],
        resources: [
          { id: one.id, name: one.name },
          { id: two.id, name: two.name },
        ],
      }),
    );
    store.dispatch(setSelectedProjectId("internal-id"));
    store.dispatch(setResources([one, two]));

    render(
      <Provider store={store}>
        <AppShell
          showSidebars={true}
          project={project as never}
          resources={[one, two]}
        />
      </Provider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open project menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Compile Project" }));
    const dialog = await screen.findByRole("dialog", {
      name: /Compile Project/i,
    });
    await user.selectOptions(
      within(dialog).getByLabelText("Compile as"),
      "pdf",
    );
    await user.click(
      await within(dialog).findByRole("button", { name: /Compile \(2\)/ }),
    );

    await expectPdfOf(BODY_ONE, BODY_TWO);
  });
});

describe("PDF compile on native, Start Page path (Feature 101, FR-29)", () => {
  it("Package > Compile Project with the native transport produces a PDF", async () => {
    const base = {
      type: "text",
      createdAt: STAMP,
      updatedAt: STAMP,
      userMetadata: {},
    };
    const one = {
      ...base,
      id: "00000000-0000-4000-8000-0000000000b1",
      name: "Chapter One",
      slug: "chapter-one",
      orderIndex: 0,
      plainText: BODY_ONE,
    };
    const two = {
      ...base,
      id: "00000000-0000-4000-8000-0000000000b2",
      name: "Chapter Two",
      slug: "chapter-two",
      orderIndex: 1,
      plainText: BODY_TWO,
    };
    await seedProject([
      { id: one.id, text: BODY_ONE },
      { id: two.id, text: BODY_TWO },
    ]);
    const project = {
      id: "p-native",
      name: "Native Novel",
      rootPath: `/projects/${DIR_ID}`,
      createdAt: STAMP,
    };
    const view = buildProjectView({
      project,
      folders: [],
      resources: [one, two],
    } as unknown as Parameters<typeof buildProjectView>[0]);
    const entry = {
      project,
      folders: view.folders,
      resources: view.resources,
    } as unknown as StartPageProjectEntry;

    render(
      <SharingLimitsProvider>
        <Provider store={makeStore()}>
          <StartPage projects={[entry]} />
        </Provider>
      </SharingLimitsProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Manage Native Novel" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Package" }));
    const dialog = await screen.findByRole("dialog", {
      name: /Compile Project/i,
    });
    await user.selectOptions(
      within(dialog).getByLabelText("Compile as"),
      "pdf",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Compile \(2\)/ }),
    );

    await expectPdfOf(BODY_ONE, BODY_TWO);
  });
});
