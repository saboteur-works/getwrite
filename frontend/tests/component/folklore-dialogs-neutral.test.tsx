/**
 * Feature 110, Task 21 (FR-20): the Compile and Export dialogs gain nothing
 * from the Narratives module. The dialogs receive resources only, so the test
 * renders both with Variant Sources (type, subtype and a tag on them) and
 * checks the visible text, the lists and the ids passed to the saved-defaults
 * setters; the module's UI entry is a view slot only. Props are those of
 * `CompilePreviewModal` and `ExportPreviewModal` (components/common/*.tsx,
 * read before use), as in `claims-dialogs-unchanged.test.tsx`.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CompilePreviewModal from "../../components/common/CompilePreviewModal";
import ExportPreviewModal from "../../components/common/ExportPreviewModal";
import { uiModuleRegistry } from "../../components/Modules/uiRegistry";
import {
  FOLKLORE_MODULE_ID,
  NARRATIVE_SUBTYPE,
  VARIANT_SUBTYPE,
} from "../../src/lib/models/folklore-types";
import type { AnyResource } from "../../src/lib/models/types";

const NARRATIVE_FOLDER_ID = "22222222-2222-4222-8222-222222222222";
const TAG = "ATU 510A | Cinderella";

const resources = [
  {
    id: "r1",
    slug: "tale-1",
    name: "Tale 1",
    type: "source",
    plainText: "",
    createdAt: "",
    updatedAt: "",
    folderId: NARRATIVE_FOLDER_ID,
    resourceSubtype: VARIANT_SUBTYPE,
    userMetadata: { motifs: [TAG] },
    orderIndex: 0,
  },
  {
    id: "r2",
    slug: "tale-2",
    name: "Tale 2",
    type: "source",
    plainText: "",
    createdAt: "",
    updatedAt: "",
    folderId: NARRATIVE_FOLDER_ID,
    resourceSubtype: VARIANT_SUBTYPE,
    userMetadata: { motifs: [TAG] },
    orderIndex: 1,
  },
] as unknown as AnyResource[];

function expectNoFolkloreTrace(): void {
  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(/narratives?|variants?|folklore|compar(e|ison)/i);
  expect(text).not.toContain(NARRATIVE_SUBTYPE);
  expect(text).not.toContain(NARRATIVE_FOLDER_ID);
  expect(text).not.toContain(TAG);
}

describe("the Narratives module's UI entry", () => {
  it("is a view slot only, with no dialog contribution", () => {
    const entry = uiModuleRegistry.modules.find(
      (m) => m.id === FOLKLORE_MODULE_ID,
    );
    expect(entry).toBeDefined();
    expect(Object.keys(entry ?? {}).sort()).toEqual(["id", "view"]);
  });
});

describe("Compile dialog with Variant Sources in the project (FR-20)", () => {
  async function setup() {
    const read = vi.fn(async () => undefined);
    const save = vi.fn(async (_id: string, ids: string[] | null) => ({
      excludedResourceIds: ids ?? undefined,
    }));
    render(
      <CompilePreviewModal
        isOpen={true}
        projectId="dir-1"
        resources={resources}
        readSavedDefaults={read}
        saveDefaults={save}
        onConfirmCompile={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await screen.findByText(/no project default is saved/i);
    return { save };
  }

  it("shows nothing about narratives, variants or a comparison", async () => {
    await setup();
    expect(screen.getByText("Compile Project")).toBeInTheDocument();
    expectNoFolkloreTrace();
  });

  it("saves only the resource ids the writer unticked", async () => {
    const { save } = await setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Tale 1" }));
    fireEvent.click(screen.getByRole("button", { name: /save as default/i }));
    expect(save).toHaveBeenCalledTimes(1);
    const [, ids] = save.mock.calls[0]!;
    expect(ids).toEqual(["r1"]);
    const sent = JSON.stringify(save.mock.calls);
    expect(sent).not.toContain(NARRATIVE_FOLDER_ID);
    expect(sent).not.toContain(FOLKLORE_MODULE_ID);
  });
});

describe("Export dialog with Variant Sources in the project (FR-20)", () => {
  async function setup() {
    const read = vi.fn(async () => undefined);
    const save = vi.fn(async (_id: string, ids: string[] | null) => ({
      excludedResourceIds: ids ?? undefined,
    }));
    render(
      <ExportPreviewModal
        isOpen={true}
        projectId="dir-1"
        resourceIds={["r1", "r2"]}
        resourceNames={["Tale 1", "Tale 2"]}
        readSavedDefaults={read}
        saveDefaults={save}
        onConfirmExport={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await screen.findByText(/no project default is saved/i);
    return { save };
  }

  it("shows nothing about narratives, variants or a comparison", async () => {
    await setup();
    expect(
      screen.getByRole("list", { name: /resources to export/i }),
    ).toBeInTheDocument();
    expectNoFolkloreTrace();
  });

  it("saves only the resource ids the writer unticked", async () => {
    const { save } = await setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Tale 2" }));
    fireEvent.click(screen.getByRole("button", { name: /save as default/i }));
    expect(save).toHaveBeenCalledTimes(1);
    const [, ids] = save.mock.calls[0]!;
    expect(ids).toEqual(["r2"]);
    const sent = JSON.stringify(save.mock.calls);
    expect(sent).not.toContain(NARRATIVE_FOLDER_ID);
    expect(sent).not.toContain(FOLKLORE_MODULE_ID);
  });
});
