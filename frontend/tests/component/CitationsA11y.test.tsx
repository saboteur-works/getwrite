/** @vitest-environment jsdom */
/**
 * Feature 116, Task 49 (FR-23): axe, keyboard and text-not-colour tests for
 * the citation fields editor, the compile dialog's citations switch and style
 * choice, and the pre-run warning dialog. The components are committed
 * (Tasks 20, 21, 27, 31, 45); this task changes no production code, so a
 * failing pin here is a finding. The jsdom `color-contrast` rule is off in
 * `runAxe`; no screen-reader run was made (see `experiments/task-49.md`).
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
import CitationFieldsEditor from "../../components/Sidebar/CitationFieldsEditor";
import CompilePreviewModal from "../../components/common/CompilePreviewModal";
import CitationCheckDialog from "../../components/common/CitationCheckDialog";
import type { AnyResource } from "../../src/lib/models/types";
import type { CitationFields } from "../../src/lib/models/citations-fields-validation";
import {
  CITATIONS_FORMAT_UNAVAILABLE_REASON,
  CITATIONS_OPEN_PROJECT_REASON,
  CITATION_REFERENCE_TYPES,
  type CitationCheckResult,
  type CitationGap,
  type CitationReferenceType,
} from "../../src/lib/models/citations-types";
import { runAxe } from "../a11y/helpers/axe";

const readCitationFields = vi.fn();
const writeCitationFields = vi.fn();

vi.mock("../../src/lib/api/citation-fields", () => ({
  CITATION_FIELDS_LOAD_FAILED_MESSAGE:
    "The citation fields could not be loaded.",
  CITATION_FIELDS_SAVE_FAILED_MESSAGE:
    "The citation fields could not be saved.",
  readCitationFields: (...args: unknown[]) => readCitationFields(...args),
  writeCitationFields: (...args: unknown[]) => writeCitationFields(...args),
}));

beforeEach(() => {
  readCitationFields.mockReset();
  writeCitationFields.mockReset();
  readCitationFields.mockResolvedValue({ kind: "fields", fields: null });
  writeCitationFields.mockImplementation(
    async (_p: string, _r: string, fields: CitationFields) => ({
      kind: "saved",
      fields,
    }),
  );
});

afterEach(cleanup);

// ---------------------------------------------------------------- editor

const STORED: Record<CitationReferenceType, CitationFields> = {
  book: {
    referenceType: "book",
    title: "Tides",
    authors: [{ family: "Hale", given: "Ada" }],
    editors: [{ literal: "The Press" }],
    date: "2001",
  },
  article: {
    referenceType: "article",
    title: "On Tides",
    journal: "Sea Journal",
    authors: [{ family: "Hale", given: "Ada" }],
  },
  "web-page": {
    referenceType: "web-page",
    title: "Tide Tables",
    website: "tides.example",
    url: "https://tides.example",
  },
  interview: {
    referenceType: "interview",
    interviewee: [{ family: "Hale", given: "Ada" }],
    date: "2020-05",
  },
} as Record<CitationReferenceType, CitationFields>;

async function renderEditor(
  extra: Partial<React.ComponentProps<typeof CitationFieldsEditor>> = {},
): Promise<HTMLElement> {
  const { container } = render(
    <CitationFieldsEditor projectId="p1" resourceId="r1" {...extra} />,
  );
  await screen.findByLabelText("Reference type");
  return container;
}

describe("citation fields editor: axe", () => {
  for (const type of CITATION_REFERENCE_TYPES) {
    it(`passes axe for a ${type} reference with stored values`, async () => {
      readCitationFields.mockResolvedValue({
        kind: "fields",
        fields: STORED[type],
      });
      const container = await renderEditor({
        stillNeeds: "Still needs: publisher",
      });
      expect(
        (screen.getByLabelText("Reference type") as HTMLSelectElement).value,
      ).toBe(type);
      await runAxe(container);
    });
  }

  it("passes axe for the empty form of each type chosen in turn", async () => {
    const user = userEvent.setup();
    const container = await renderEditor();
    for (const type of CITATION_REFERENCE_TYPES) {
      await user.selectOptions(screen.getByLabelText("Reference type"), type);
      await runAxe(container);
    }
  });

  it("passes axe with a failed read (alert, Retry, no fields)", async () => {
    readCitationFields.mockResolvedValue({
      kind: "failed",
      message: "The citation fields could not be loaded.",
    });
    const { container } = render(
      <CitationFieldsEditor projectId="p1" resourceId="r1" />,
    );
    await screen.findByRole("alert");
    await runAxe(container);
  });

  it("passes axe with a failed save (alert) and with a saved notice (status)", async () => {
    const user = userEvent.setup();
    const container = await renderEditor();
    await user.type(screen.getByLabelText(/^date/i), "not a date");
    await user.click(
      screen.getByRole("button", { name: "Save citation fields" }),
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    await runAxe(container);
    await user.clear(screen.getByLabelText(/^date/i));
    await user.click(
      screen.getByRole("button", { name: "Save citation fields" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("saved"),
    );
    await runAxe(container);
  });
});

describe("citation fields editor: keyboard", () => {
  it("reaches every control by Tab and runs Add and Save by keyboard alone", async () => {
    const user = userEvent.setup();
    await renderEditor();
    const reached = new Set<string>();
    const total = 40;
    for (let i = 0; i < total; i += 1) {
      await user.tab();
      const active = document.activeElement as HTMLElement;
      reached.add(
        active.getAttribute("aria-label") ??
          screen.queryByLabelText(active.id)?.id ??
          active.textContent ??
          active.id,
      );
    }
    // Book form: type, add authors, add editors, title, edition, publisher,
    // place, date, url, accessed, save.
    const expectedNames: RegExp[] = [/add authors/i, /add editors/i];
    for (const re of expectedNames) {
      expect([...reached].some((n) => re.test(n))).toBe(true);
    }

    const typeSelect = screen.getByLabelText("Reference type");
    typeSelect.focus();
    expect(document.activeElement).toBe(typeSelect);

    const add = screen.getByRole("button", { name: /add authors/i });
    add.focus();
    await user.keyboard("{Enter}");
    const family = await screen.findByLabelText(/authors 1 family name/i);
    await user.click(family);
    await user.keyboard("Hale");
    const save = screen.getByRole("button", { name: "Save citation fields" });
    save.focus();
    await user.keyboard(" ");
    await waitFor(() => expect(writeCitationFields).toHaveBeenCalledTimes(1));
    expect(writeCitationFields.mock.calls[0][2]).toMatchObject({
      referenceType: "book",
      authors: [{ family: "Hale", given: "" }],
    });
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("saved"),
    );
  });

  it("every text field can be focused by Tab in document order and typed into", async () => {
    const user = userEvent.setup();
    await renderEditor();
    const title = screen.getByLabelText(/^title/i);
    // Tab from the reference type until the title is reached.
    screen.getByLabelText("Reference type").focus();
    let guard = 0;
    while (document.activeElement !== title && guard < 20) {
      await user.tab();
      guard += 1;
    }
    expect(document.activeElement).toBe(title);
    await user.keyboard("Tides");
    expect((title as HTMLInputElement).value).toBe("Tides");
  });
});

describe("citation fields editor: text, not colour, and live regions", () => {
  it("states a failed save in a role=alert starting with 'Error:'", async () => {
    const user = userEvent.setup();
    await renderEditor();
    await user.type(screen.getByLabelText(/^date/i), "nope");
    await user.click(
      screen.getByRole("button", { name: "Save citation fields" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/^Error: .*YYYY/);
  });

  it("states a failed read in a role=alert and offers Retry", async () => {
    readCitationFields.mockResolvedValue({
      kind: "failed",
      message: "The citation fields could not be loaded.",
    });
    render(<CitationFieldsEditor projectId="p1" resourceId="r1" />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/^Error: /);
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByLabelText("Reference type")).toBeNull();
  });

  it("puts loading, still-needs and saved messages in role=status, never role=alert", async () => {
    let resolveRead: (v: unknown) => void = () => undefined;
    readCitationFields.mockReturnValue(
      new Promise((r) => {
        resolveRead = r;
      }),
    );
    render(
      <CitationFieldsEditor
        projectId="p1"
        resourceId="r1"
        stillNeeds="Still needs: publisher"
      />,
    );
    expect(screen.getByRole("status").textContent).toMatch(/Loading/);
    expect(screen.queryByRole("alert")).toBeNull();
    resolveRead({ kind: "fields", fields: null });
    await screen.findByLabelText("Reference type");
    const statuses = screen
      .getAllByRole("status")
      .map((s: HTMLElement) => s.textContent);
    expect(statuses).toContain("Still needs: publisher");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("gives the date field a visible text format hint tied by aria-describedby", async () => {
    await renderEditor();
    const date = screen.getByLabelText(/^date/i);
    const hintId = date.getAttribute("aria-describedby");
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId as string)?.textContent).toMatch(
      /YYYY/,
    );
  });
});

// ------------------------------------------------------- compile dialog

function textResource(id: string, name: string, order: number): AnyResource {
  return {
    id,
    slug: id,
    name,
    type: "text",
    plainText: "",
    createdAt: "",
    updatedAt: "",
    userMetadata: {},
    orderIndex: order,
  } as AnyResource;
}

const RESOURCES: AnyResource[] = [textResource("r1", "Scene 1", 0)];

type CompileProps = Partial<React.ComponentProps<typeof CompilePreviewModal>>;

function renderCompile(extra: CompileProps = {}): void {
  render(
    <CompilePreviewModal
      isOpen
      projectId="p1"
      resources={RESOURCES}
      readSavedDefaults={async () => undefined}
      citationsModuleEnabled
      runCitationCheck={async () => ({
        status: "ok",
        gaps: [],
        citationCount: 0,
        incompleteSourceCount: 0,
      })}
      onConfirmCompile={vi.fn()}
      onClose={vi.fn()}
      {...extra}
    />,
  );
}

async function chooseFormat(
  user: ReturnType<typeof userEvent.setup>,
  format: string,
): Promise<void> {
  await user.selectOptions(screen.getByLabelText(/compile as/i), format);
}

/** The citations controls' own status region (the dialog has others). */
function citationsStatus(): HTMLElement {
  const controls = screen.getByTestId("compile-citations-controls");
  return within(controls).getByRole("status");
}

function dialogOf(name: RegExp): HTMLElement {
  return screen.getByRole("dialog", { name });
}

describe("compile dialog citations controls: axe", () => {
  it("passes axe with the switch on (PDF) and the style choice enabled", async () => {
    const user = userEvent.setup();
    renderCompile();
    await chooseFormat(user, "pdf");
    expect(screen.getByRole("checkbox", { name: "Citations" })).toBeEnabled();
    await runAxe(dialogOf(/compile project/i), ["region"]);
  });

  it("passes axe with the switch turned on and the style choice enabled", async () => {
    const user = userEvent.setup();
    renderCompile();
    await chooseFormat(user, "docx");
    await user.click(screen.getByRole("checkbox", { name: "Citations" }));
    expect(screen.getByLabelText(/citation style/i)).toBeEnabled();
    await runAxe(dialogOf(/compile project/i), ["region"]);
  });

  it("passes axe with the switch disabled for a text format (stated reason)", async () => {
    renderCompile();
    expect(screen.getByRole("checkbox", { name: "Citations" })).toBeDisabled();
    expect(citationsStatus().textContent).toBe(
      CITATIONS_FORMAT_UNAVAILABLE_REASON,
    );
    await runAxe(dialogOf(/compile project/i), ["region"]);
  });

  it("passes axe with the switch disabled on Android (stated reason)", async () => {
    const user = userEvent.setup();
    renderCompile({ isAndroidRuntime: true });
    await chooseFormat(user, "pdf");
    expect(screen.getByRole("checkbox", { name: "Citations" })).toBeDisabled();
    expect(citationsStatus().textContent).toBe(
      CITATIONS_FORMAT_UNAVAILABLE_REASON,
    );
    await runAxe(dialogOf(/compile project/i), ["region"]);
  });

  it("passes axe with the switch disabled because the project config is unknown", async () => {
    const user = userEvent.setup();
    renderCompile({
      citationsModuleEnabled: false,
      citationsAvailability: "unknown",
    });
    await chooseFormat(user, "pdf");
    expect(screen.getByRole("checkbox", { name: "Citations" })).toBeDisabled();
    expect(citationsStatus().textContent).toBe(CITATIONS_OPEN_PROJECT_REASON);
    await runAxe(dialogOf(/compile project/i), ["region"]);
  });
});

describe("compile dialog citations controls: keyboard and text", () => {
  it("reaches the switch and the style choice by Tab and toggles the switch with Space", async () => {
    const user = userEvent.setup();
    renderCompile();
    await chooseFormat(user, "pdf");
    const select = screen.getByLabelText(/compile as/i);
    const toggle = screen.getByRole("checkbox", { name: "Citations" });
    const style = screen.getByLabelText(/citation style/i);
    expect(style).toBeDisabled();

    select.focus();
    await user.tab();
    expect(document.activeElement).toBe(toggle);
    await user.keyboard(" ");
    expect((toggle as HTMLInputElement).checked).toBe(true);
    expect(style).toBeEnabled();
    await user.tab();
    expect(document.activeElement).toBe(style);
    await user.keyboard(" ");
    await user.keyboard("{Escape}");
  });

  it("skips a disabled switch in the tab order and states the reason as text", async () => {
    const user = userEvent.setup();
    renderCompile();
    const select = screen.getByLabelText(/compile as/i);
    select.focus();
    await user.tab();
    expect(document.activeElement).not.toBe(
      screen.getByRole("checkbox", { name: "Citations" }),
    );
    const toggle = screen.getByRole("checkbox", { name: "Citations" });
    const describedBy = toggle.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toBe(
      CITATIONS_FORMAT_UNAVAILABLE_REASON,
    );
  });

  it("names the style as text, and the reason sits in a role=status region", async () => {
    renderCompile();
    const style = screen.getByLabelText(/citation style/i);
    expect(within(style).getByRole("option").textContent).toMatch(
      /Chicago.*en-US/,
    );
    const status = citationsStatus();
    expect(status.id).toBe("compile-citations-status");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears the status text once the switch is usable", async () => {
    const user = userEvent.setup();
    renderCompile();
    await chooseFormat(user, "pdf");
    expect(citationsStatus().textContent).toBe("");
  });
});

// ------------------------------------------------------- warning dialog

const REMOVED: CitationGap = {
  kind: "source-removed",
  resourceId: "r1",
  sourceId: "s-removed",
  sourceName: "Old Almanac",
};
const MISSING: CitationGap = {
  kind: "missing-detail",
  resourceId: "r1",
  sourceId: "s-missing",
  sourceName: "Field Guide",
  missingDetails: ["publisher", "date"],
};
const UNCHECKED: CitationGap = {
  kind: "could-not-be-checked",
  resourceId: "r1",
  sourceId: "s-unchecked",
  sourceName: "Harbour Log",
};

function okResult(gaps: CitationGap[]): CitationCheckResult {
  return {
    status: "ok",
    gaps,
    citationCount: gaps.length,
    incompleteSourceCount: new Set(gaps.map((g) => g.sourceId)).size,
  };
}

function renderWarning(
  result: CitationCheckResult,
  handlers: { onProceed?: () => void; onCancel?: () => void } = {},
): { onProceed: () => void; onCancel: () => void } {
  const onProceed = handlers.onProceed ?? vi.fn();
  const onCancel = handlers.onCancel ?? vi.fn();
  render(
    <CitationCheckDialog
      isOpen
      result={result}
      onProceed={onProceed}
      onCancel={onCancel}
    />,
  );
  return { onProceed, onCancel };
}

const WARNING_CASES: ReadonlyArray<{
  label: string;
  gap: CitationGap;
  text: RegExp;
}> = [
  { label: "a removed Source", gap: REMOVED, text: /^Removed:/ },
  { label: "a missing detail", gap: MISSING, text: /^Incomplete: missing/ },
  {
    label: "a could-not-be-checked Source",
    gap: UNCHECKED,
    text: /^Could not be checked:/,
  },
];

describe("warning dialog: axe, focus, text", () => {
  for (const { label, gap, text } of WARNING_CASES) {
    it(`passes axe with ${label}, names the state in text and takes focus`, async () => {
      renderWarning(okResult([gap]));
      const dialog = screen.getByRole("dialog", {
        name: /check citations before compiling/i,
      });
      await runAxe(dialog, ["region"]);
      await runAxe(document.body, ["region"]);
      expect(dialog.contains(document.activeElement)).toBe(true);
      const list = within(dialog).getByRole("list", {
        name: "Sources with incomplete citations",
      });
      const item = within(list).getByRole("listitem");
      expect(item.textContent).toContain(gap.sourceName);
      const stateLines = within(item)
        .getAllByText(text)
        .map((n: HTMLElement) => n.textContent);
      expect(stateLines.length).toBe(1);
    });
  }

  it("passes axe with all three states at once and a summary in text", async () => {
    renderWarning(okResult([REMOVED, MISSING, UNCHECKED]));
    const dialog = screen.getByRole("dialog", {
      name: /check citations before compiling/i,
    });
    await runAxe(document.body, ["region"]);
    expect(dialog.textContent).toContain("3 citations, 3 Sources incomplete");
    const list = within(dialog).getByRole("list", {
      name: "Sources with incomplete citations",
    });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  });

  it("passes axe for a failed check, with the failure in role=alert and Cancel only", async () => {
    renderWarning({
      status: "failed",
      failure: "engine-failed",
      message: "The engine failed.",
    });
    await runAxe(document.body, ["region"]);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The engine failed.",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Proceed" })).toBeNull();
  });

  it("uses no red class on the warning", async () => {
    renderWarning(okResult([REMOVED, MISSING, UNCHECKED]));
    const dialog = screen.getByRole("dialog");
    expect(dialog.outerHTML).not.toMatch(/\bred\b|text-red|bg-red|border-red/);
  });
});

describe("warning dialog: keyboard", () => {
  it("reaches Cancel and Proceed by Tab, and each runs by Enter", async () => {
    const user = userEvent.setup();
    const onProceed = vi.fn();
    const onCancel = vi.fn();
    renderWarning(okResult([MISSING]), { onProceed, onCancel });
    const dialog = screen.getByRole("dialog");
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const proceed = within(dialog).getByRole("button", { name: "Proceed" });
    // Focus starts inside the dialog; Tab reaches both buttons without
    // leaving it.
    const seen = new Set<Element | null>();
    for (let i = 0; i < 6; i += 1) {
      seen.add(document.activeElement);
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    seen.add(document.activeElement);
    expect(seen.has(cancel)).toBe(true);
    expect(seen.has(proceed)).toBe(true);
    cancel.focus();
    await user.keyboard("{Enter}");
    expect(onCancel).toHaveBeenCalledTimes(1);
    proceed.focus();
    await user.keyboard("{Enter}");
    expect(onProceed).toHaveBeenCalledTimes(1);
  });

  it("Escape cancels", async () => {
    const user = userEvent.setup();
    const { onCancel, onProceed } = renderWarning(okResult([MISSING]));
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onProceed).not.toHaveBeenCalled();
  });
});

describe("warning dialog in the compile flow: focus", () => {
  it("moves focus into the warning when the check finds gaps, by keyboard alone", async () => {
    const user = userEvent.setup();
    const onConfirmCompile = vi.fn();
    renderCompile({
      runCitationCheck: async () => okResult([REMOVED, MISSING, UNCHECKED]),
      onConfirmCompile,
    });
    await chooseFormat(user, "pdf");
    const toggle = screen.getByRole("checkbox", { name: "Citations" });
    toggle.focus();
    await user.keyboard(" ");
    const compile = screen.getByRole("button", { name: /^compile \(/i });
    await waitFor(() => expect(compile).toBeEnabled());
    compile.focus();
    await user.keyboard("{Enter}");
    const warning = await screen.findByRole("dialog", {
      name: /check citations before compiling/i,
    });
    await waitFor(() =>
      expect(warning.contains(document.activeElement)).toBe(true),
    );
    expect(onConfirmCompile).not.toHaveBeenCalled();
    await user.tab();
    const proceed = within(warning).getByRole("button", { name: "Proceed" });
    proceed.focus();
    await user.keyboard("{Enter}");
    expect(onConfirmCompile).toHaveBeenCalledTimes(1);
    expect(onConfirmCompile.mock.calls[0][1].citations).toEqual({
      styleId: expect.any(String),
    });
  });
});
