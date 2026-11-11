/**
 * Feature 108, Task 27 (FR-20): the Compile and Export dialogs show nothing
 * about claims and no claim id enters the saved defaults they write. A claim
 * is an annotation, not a resource, so the dialogs receive resources only;
 * the test renders both with a project that has a claim on a resource and
 * checks the visible text, the lists and the ids passed to the setters.
 * Props are those of `CompilePreviewModal` and `ExportPreviewModal`
 * (components/common/*.tsx, read before use).
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CompilePreviewModal from "../../components/common/CompilePreviewModal";
import ExportPreviewModal from "../../components/common/ExportPreviewModal";
import type { AnyResource } from "../../src/lib/models/types";

const CLAIM_ID = "11111111-1111-4111-8111-111111111111";
const CLAIM_STATEMENT = "The harbour closed in 1921";

const resources = [
  {
    id: "r1",
    slug: "scene-1",
    name: "Scene 1",
    type: "text",
    plainText: "",
    createdAt: "",
    updatedAt: "",
    userMetadata: {},
    orderIndex: 0,
    // A stored claim on this resource's sidecar; the dialogs must not show it.
    annotations: [
      {
        id: CLAIM_ID,
        body: CLAIM_STATEMENT,
        quote: "harbour",
        claim: {
          status: "unverified",
          statusChangedAt: "2026-11-10T00:00:00.000Z",
        },
        createdAt: "2026-11-10T00:00:00.000Z",
        updatedAt: "2026-11-10T00:00:00.000Z",
      },
    ],
  },
  {
    id: "r2",
    slug: "scene-2",
    name: "Scene 2",
    type: "text",
    plainText: "",
    createdAt: "",
    updatedAt: "",
    userMetadata: {},
    orderIndex: 1,
  },
] as unknown as AnyResource[];

function visibleText(): string {
  return document.body.textContent ?? "";
}

function expectNoClaimTrace(): void {
  const text = visibleText();
  expect(text).not.toMatch(/claim/i);
  expect(text).not.toMatch(/unverified|disputed|needs review/i);
  expect(text).not.toContain(CLAIM_STATEMENT);
  expect(text).not.toContain(CLAIM_ID);
}

describe("Compile dialog with a claim in the project (FR-20)", () => {
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

  it("shows nothing about claims", async () => {
    await setup();
    expect(screen.getByText("Compile Project")).toBeInTheDocument();
    expectNoClaimTrace();
  });

  it("saves only resource ids as the project default", async () => {
    const { save } = await setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Scene 1" }));
    fireEvent.click(screen.getByRole("button", { name: /save as default/i }));
    expect(save).toHaveBeenCalledTimes(1);
    const [, ids] = save.mock.calls[0]!;
    expect(ids).toEqual(["r1"]);
    expect(JSON.stringify(save.mock.calls)).not.toContain(CLAIM_ID);
  });
});

describe("Export dialog with a claim in the project (FR-20)", () => {
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
        resourceNames={["Scene 1", "Scene 2"]}
        readSavedDefaults={read}
        saveDefaults={save}
        onConfirmExport={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await screen.findByText(/no project default is saved/i);
    return { save };
  }

  it("shows nothing about claims", async () => {
    await setup();
    expect(
      screen.getByRole("list", { name: /resources to export/i }),
    ).toBeInTheDocument();
    expectNoClaimTrace();
  });

  it("saves only resource ids as the project default", async () => {
    const { save } = await setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Scene 2" }));
    fireEvent.click(screen.getByRole("button", { name: /save as default/i }));
    expect(save).toHaveBeenCalledTimes(1);
    const [, ids] = save.mock.calls[0]!;
    expect(ids).toEqual(["r2"]);
    expect(JSON.stringify(save.mock.calls)).not.toContain(CLAIM_ID);
  });
});
