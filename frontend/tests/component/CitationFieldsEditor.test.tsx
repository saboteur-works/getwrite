/** @vitest-environment jsdom */
/**
 * Feature 116, Task 20 (FR-5, FR-7, FR-23): the citation fields editor.
 * The Task 19 client is mocked; no network is touched.
 */
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Provider } from "react-redux";
import CitationFieldsEditor, {
  CITATION_FIELDS_SAVE_DEBOUNCE_MS,
} from "../../components/Sidebar/CitationFieldsEditor";
import CitationFieldsSection from "../../components/Sidebar/CitationFieldsSection";
import { StaticModulesProvider } from "../../components/Modules/ModulesContext";
import { createSourceResource } from "../../src/lib/models/resource-factory";
import { makeStore } from "../../src/store/store";
import {
  CITATION_FIELDS_BY_TYPE,
  CITATION_FIELD_LIMITS,
  CITATION_REFERENCE_TYPES,
} from "../../src/lib/models/citations-types";
import type { CitationFields } from "../../src/lib/models/citations-fields-validation";
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

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

async function renderEditor(
  extra: Partial<React.ComponentProps<typeof CitationFieldsEditor>> = {},
): Promise<void> {
  render(<CitationFieldsEditor projectId="p1" resourceId="r1" {...extra} />);
  await screen.findByLabelText("Reference type");
}

/** Switches to fake timers once the editor is loaded; the debounce is never waited for. */
function useFakeClock(): void {
  vi.useFakeTimers();
}

/** Advances the fake clock and lets the awaited write settle. */
async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Waits out the debounce so a pending change is written. */
async function settleSave(): Promise<void> {
  await advance(CITATION_FIELDS_SAVE_DEBOUNCE_MS);
}

describe("CitationFieldsEditor", () => {
  it("offers the four reference types", async () => {
    await renderEditor();
    const options = within(screen.getByLabelText("Reference type"))
      .getAllByRole("option")
      .map((o: HTMLElement) => (o as HTMLOptionElement).value);
    expect(options).toEqual([...CITATION_REFERENCE_TYPES]);
  });

  it("shows the fixed fields of each chosen type with accessible names", async () => {
    await renderEditor();
    for (const type of CITATION_REFERENCE_TYPES) {
      fireEvent.change(screen.getByLabelText("Reference type"), {
        target: { value: type },
      });
      for (const spec of CITATION_FIELDS_BY_TYPE[type]) {
        if (spec.kind === "people") {
          expect(
            screen.getByRole("group", { name: new RegExp(spec.name, "i") }),
          ).toBeTruthy();
        } else {
          expect(
            screen.getByLabelText(
              new RegExp(
                `^${spec.name === "pages" ? "page range" : spec.name}`,
                "i",
              ),
            ),
          ).toBeTruthy();
        }
      }
    }
    fireEvent.change(screen.getByLabelText("Reference type"), {
      target: { value: "book" },
    });
    expect(screen.queryByLabelText(/^journal/i)).toBeNull();
  });

  it("applies the text limit to text inputs", async () => {
    await renderEditor();
    expect(screen.getByLabelText(/^title/i).getAttribute("maxlength")).toBe(
      String(CITATION_FIELD_LIMITS.maxTextLength),
    );
  });

  it("writes nothing on open", async () => {
    await renderEditor();
    expect(readCitationFields).toHaveBeenCalledWith("p1", "r1");
    expect(writeCitationFields).not.toHaveBeenCalled();
  });

  it("loads stored fields into the form", async () => {
    readCitationFields.mockResolvedValue({
      kind: "fields",
      fields: {
        referenceType: "article",
        title: "On Tides",
        authors: [{ family: "Hale", given: "Ada" }],
      },
    });
    await renderEditor();
    expect(
      (screen.getByLabelText("Reference type") as HTMLSelectElement).value,
    ).toBe("article");
    expect((screen.getByLabelText(/^title/i) as HTMLInputElement).value).toBe(
      "On Tides",
    );
    expect(
      (screen.getByLabelText(/authors 1 family name/i) as HTMLInputElement)
        .value,
    ).toBe("Hale");
  });

  it("saves a person as family and given and an organisation as a literal", async () => {
    await renderEditor();
    useFakeClock();
    fireEvent.click(screen.getByRole("button", { name: /add authors/i }));
    fireEvent.change(screen.getByLabelText(/authors 1 family name/i), {
      target: { value: "Hale" },
    });
    fireEvent.change(screen.getByLabelText(/authors 1 given name/i), {
      target: { value: "Ada" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add authors/i }));
    fireEvent.change(screen.getByLabelText(/authors 2 kind/i), {
      target: { value: "organisation" },
    });
    fireEvent.change(screen.getByLabelText(/authors 2 organisation name/i), {
      target: { value: "Tide Board" },
    });
    fireEvent.change(screen.getByLabelText(/^title/i), {
      target: { value: "Tides" },
    });
    await settleSave();
    expect(writeCitationFields).toHaveBeenCalledTimes(1);
    expect(writeCitationFields).toHaveBeenCalledWith("p1", "r1", {
      referenceType: "book",
      authors: [{ family: "Hale", given: "Ada" }, { literal: "Tide Board" }],
      title: "Tides",
    });
    expect(screen.getByRole("status").textContent).toMatch(/saved/i);
  });

  it("omits empty fields so an incomplete Source is savable", async () => {
    await renderEditor();
    useFakeClock();
    fireEvent.change(screen.getByLabelText(/^title/i), {
      target: { value: "x" },
    });
    fireEvent.change(screen.getByLabelText(/^title/i), {
      target: { value: "" },
    });
    await settleSave();
    expect(writeCitationFields).toHaveBeenCalledTimes(1);
    expect(writeCitationFields).toHaveBeenCalledWith("p1", "r1", {
      referenceType: "book",
    });
  });

  it("does not call the client for a malformed date and states the reason in text", async () => {
    await renderEditor();
    useFakeClock();
    const date = screen.getByLabelText(/^date/i);
    fireEvent.change(date, { target: { value: "next week" } });
    await settleSave();
    expect(writeCitationFields).not.toHaveBeenCalled();
    expect(date.getAttribute("aria-invalid")).toBe("true");
    const described = (date.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id: string) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    expect(described).toMatch(/YYYY/);
  });

  it("shows a failed read in role=alert, not as empty fields", async () => {
    readCitationFields.mockResolvedValue({
      kind: "failed",
      message: "The citation fields could not be loaded.",
    });
    render(<CitationFieldsEditor projectId="p1" resourceId="r1" />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "could not be loaded",
    );
    expect(screen.queryByLabelText("Reference type")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /save citation fields/i }),
    ).toBeNull();
  });

  it("retries a failed read", async () => {
    readCitationFields.mockResolvedValueOnce({ kind: "failed", message: "x" });
    render(<CitationFieldsEditor projectId="p1" resourceId="r1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await screen.findByLabelText("Reference type");
    expect(readCitationFields).toHaveBeenCalledTimes(2);
  });

  it("shows a read that throws (for example a locked project) as an alert", async () => {
    readCitationFields.mockRejectedValue(new Error("locked"));
    render(<CitationFieldsEditor projectId="p1" resourceId="r1" />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "could not be loaded",
    );
  });

  it("shows a failed save in role=alert and keeps the entered values", async () => {
    writeCitationFields.mockResolvedValue({
      kind: "failed",
      message: "The citation fields could not be saved.",
    });
    await renderEditor();
    useFakeClock();
    fireEvent.change(screen.getByLabelText(/^title/i), {
      target: { value: "Tides" },
    });
    await settleSave();
    expect(screen.getByRole("alert").textContent).toContain(
      "could not be saved",
    );
    expect((screen.getByLabelText(/^title/i) as HTMLInputElement).value).toBe(
      "Tides",
    );
    expect(screen.getByRole("status").textContent).not.toMatch(/saved/i);
  });

  it("renders the still-needs line as text, and not when absent", async () => {
    await renderEditor({ stillNeeds: "Still needs: publisher, date" });
    expect(screen.getByText("Still needs: publisher, date")).toBeTruthy();
    cleanup();
    await renderEditor();
    expect(screen.queryByText(/still needs/i)).toBeNull();
  });

  it("puts role=status on the still-needs line itself", async () => {
    await renderEditor({ stillNeeds: "Still needs: Publisher" });
    const line = screen.getByText("Still needs: Publisher");
    expect(line.getAttribute("role")).toBe("status");
    expect(
      screen
        .getAllByRole("status")
        .filter((el: HTMLElement) => el.textContent?.includes("Still needs")),
    ).toHaveLength(1);
  });

  it("calls onDraftChange with the draft fields as the writer types, before any save", async () => {
    const onDraftChange = vi.fn();
    await renderEditor({ onDraftChange });
    expect(onDraftChange).toHaveBeenLastCalledWith({ referenceType: "book" });
    fireEvent.change(screen.getByLabelText(/^title/i), {
      target: { value: "Tides" },
    });
    expect(onDraftChange).toHaveBeenLastCalledWith({
      referenceType: "book",
      title: "Tides",
    });
    fireEvent.change(screen.getByLabelText("Reference type"), {
      target: { value: "web-page" },
    });
    expect(onDraftChange).toHaveBeenLastCalledWith({
      referenceType: "web-page",
      title: "Tides",
    });
    expect(writeCitationFields).not.toHaveBeenCalled();
  });

  it("does not call onDraftChange on a failed read", async () => {
    const onDraftChange = vi.fn();
    readCitationFields.mockResolvedValue({ kind: "failed", message: "x" });
    render(
      <CitationFieldsEditor
        projectId="p1"
        resourceId="r1"
        onDraftChange={onDraftChange}
      />,
    );
    await screen.findByRole("alert");
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it("is operable by keyboard alone: controls are native and focusable", async () => {
    await renderEditor();
    const controls = [
      ...screen.getAllByRole("combobox"),
      ...screen.getAllByRole("textbox"),
      ...screen.getAllByRole("button"),
    ];
    for (const control of controls) {
      expect(control.getAttribute("tabindex")).not.toBe("-1");
      expect(control.hasAttribute("disabled")).toBe(false);
    }
    expect(
      screen.queryByRole("button", { name: /save citation fields/i }),
    ).toBeNull();
    const title = screen.getByLabelText(/^title/i);
    title.focus();
    expect(document.activeElement).toBe(title);
  });

  it("passes axe in the loaded and failed-read states", async () => {
    await renderEditor({ stillNeeds: "Still needs: publisher" });
    fireEvent.click(screen.getByRole("button", { name: /add authors/i }));
    await runAxe(document.body, ["region"]);
    cleanup();
    readCitationFields.mockResolvedValue({ kind: "failed", message: "x" });
    render(<CitationFieldsEditor projectId="p1" resourceId="r1" />);
    await screen.findByRole("alert");
    await runAxe(document.body, ["region"]);
  });
});

describe("CitationFieldsEditor: the date rule (Task 65, FR-5)", () => {
  const NOW = new Date("2026-11-16T12:00:00Z");

  function messageOf(input: HTMLElement): string {
    const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
    return ids
      .map((id: string) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
  }

  it("marks a typed non-real date invalid with the reason in text", async () => {
    await renderEditor({ now: NOW });
    const input = screen.getByLabelText(/^date/i);
    expect(input.getAttribute("aria-invalid")).not.toBe("true");
    fireEvent.change(input, { target: { value: "2005-01-55" } });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(messageOf(input)).toMatch(/not a real date/i);
    expect(messageOf(input)).not.toMatch(/later than today/i);
  });

  it("says a date after today at UTC+14 is later than today, and pins the boundary on the injected clock", async () => {
    await renderEditor({ now: new Date("2026-11-16T09:59:59Z") });
    const input = screen.getByLabelText(/^date/i);
    fireEvent.change(input, { target: { value: "2026-11-16" } });
    expect(input.getAttribute("aria-invalid")).not.toBe("true");
    fireEvent.change(input, { target: { value: "2026-11-17" } });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(messageOf(input)).toMatch(/later than today/i);
    cleanup();
    await renderEditor({ now: new Date("2026-11-16T10:00:00Z") });
    const rolled = screen.getByLabelText(/^date/i);
    fireEvent.change(rolled, { target: { value: "2026-11-17" } });
    expect(rolled.getAttribute("aria-invalid")).not.toBe("true");
  });

  it("marks a value stored before this rule, without editing it", async () => {
    readCitationFields.mockResolvedValue({
      kind: "fields",
      fields: {
        referenceType: "web-page",
        date: "2005-01-55",
        accessed: "2088",
      },
    });
    await renderEditor({ now: NOW });
    const date = screen.getByLabelText(/^date/i);
    const accessed = screen.getByLabelText(/^accessed/i);
    expect(date.getAttribute("aria-invalid")).toBe("true");
    expect(messageOf(date)).toMatch(/not a real date/i);
    expect(accessed.getAttribute("aria-invalid")).toBe("true");
    expect(messageOf(accessed)).toMatch(/later than today/i);
    expect(writeCitationFields).not.toHaveBeenCalled();
  });

  it("shows no reason for valid dates or an empty field", async () => {
    readCitationFields.mockResolvedValue({
      kind: "fields",
      fields: { referenceType: "web-page", date: "2024-02-29" },
    });
    await renderEditor({ now: NOW });
    const date = screen.getByLabelText(/^date/i);
    expect(date.getAttribute("aria-invalid")).not.toBe("true");
    expect(messageOf(date)).not.toMatch(/real date|later than today/i);
    expect(
      screen.getByLabelText(/^accessed/i).getAttribute("aria-invalid"),
    ).not.toBe("true");
  });

  it("does not call the client for a non-real date", async () => {
    await renderEditor({ now: NOW });
    useFakeClock();
    fireEvent.change(screen.getByLabelText(/^date/i), {
      target: { value: "2023-02-29" },
    });
    await settleSave();
    expect(writeCitationFields).not.toHaveBeenCalled();
  });

  it("the still-needs line of the section names the invalid stored date, as the pre-run check does", async () => {
    readCitationFields.mockResolvedValue({
      kind: "fields",
      fields: {
        referenceType: "interview",
        interviewee: [{ family: "Doe", given: "Jo" }],
        interviewer: [{ family: "Roe", given: "Al" }],
        date: "2005-01-55",
      },
    });
    render(
      <Provider store={makeStore()}>
        <StaticModulesProvider value={{ citations: true }}>
          <CitationFieldsSection
            projectId="p1"
            resource={createSourceResource({ name: "Talk" })}
          />
        </StaticModulesProvider>
      </Provider>,
    );
    expect(await screen.findByText("Still needs: Date")).toBeTruthy();
  });
});

describe("CitationFieldsEditor: saves as you type (Task 66, FR-7)", () => {
  const NOW = new Date("2026-11-16T12:00:00Z");
  const DEBOUNCE = CITATION_FIELDS_SAVE_DEBOUNCE_MS;

  function type(label: RegExp, value: string): void {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }

  function sectionFor(
    resource: ReturnType<typeof createSourceResource>,
  ): JSX.Element {
    return (
      <Provider store={makeStore()}>
        <StaticModulesProvider value={{ citations: true }}>
          <CitationFieldsSection projectId="p1" resource={resource} />
        </StaticModulesProvider>
      </Provider>
    );
  }

  it("renders no Save button", async () => {
    await renderEditor();
    expect(
      screen.queryByRole("button", { name: /save citation fields/i }),
    ).toBeNull();
    expect(screen.queryByText(/save citation fields/i)).toBeNull();
  });

  it("makes no write request on open, however long it waits", async () => {
    readCitationFields.mockResolvedValue({
      kind: "fields",
      fields: { referenceType: "book", title: "Stored" },
    });
    await renderEditor({ now: NOW });
    useFakeClock();
    await advance(DEBOUNCE * 10);
    expect(writeCitationFields).not.toHaveBeenCalled();
  });

  it("writes once with the validated fields after the debounce, not before", async () => {
    await renderEditor({ now: NOW });
    useFakeClock();
    type(/^title/i, "Tides");
    await advance(DEBOUNCE - 1);
    expect(writeCitationFields).not.toHaveBeenCalled();
    await advance(1);
    expect(writeCitationFields).toHaveBeenCalledTimes(1);
    expect(writeCitationFields).toHaveBeenCalledWith("p1", "r1", {
      referenceType: "book",
      title: "Tides",
    });
    await advance(DEBOUNCE * 5);
    expect(writeCitationFields).toHaveBeenCalledTimes(1);
  });

  it("makes one write carrying the last values for several changes within the debounce", async () => {
    await renderEditor({ now: NOW });
    useFakeClock();
    type(/^title/i, "T");
    await advance(DEBOUNCE - 1);
    type(/^title/i, "Ti");
    await advance(DEBOUNCE - 1);
    type(/^publisher/i, "Press");
    type(/^title/i, "Tides");
    await advance(DEBOUNCE);
    expect(writeCitationFields).toHaveBeenCalledTimes(1);
    expect(writeCitationFields).toHaveBeenCalledWith("p1", "r1", {
      referenceType: "book",
      title: "Tides",
      publisher: "Press",
    });
  });

  it("shows a status after a successful save", async () => {
    await renderEditor({ now: NOW });
    useFakeClock();
    type(/^title/i, "Tides");
    await settleSave();
    const saved = screen
      .getAllByRole("status")
      .some((s: HTMLElement) =>
        /citation fields saved/i.test(s.textContent ?? ""),
      );
    expect(saved).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("flushes a pending valid change when the editor unmounts", async () => {
    const view = render(
      <CitationFieldsEditor projectId="p1" resourceId="r1" now={NOW} />,
    );
    await screen.findByLabelText("Reference type");
    useFakeClock();
    type(/^title/i, "Tides");
    expect(writeCitationFields).not.toHaveBeenCalled();
    view.unmount();
    expect(writeCitationFields).toHaveBeenCalledTimes(1);
    expect(writeCitationFields).toHaveBeenCalledWith("p1", "r1", {
      referenceType: "book",
      title: "Tides",
    });
    await advance(DEBOUNCE * 3);
    expect(writeCitationFields).toHaveBeenCalledTimes(1);
  });

  it("writes nothing on unmount when nothing was changed", async () => {
    const view = render(
      <CitationFieldsEditor projectId="p1" resourceId="r1" now={NOW} />,
    );
    await screen.findByLabelText("Reference type");
    view.unmount();
    expect(writeCitationFields).not.toHaveBeenCalled();
  });

  it("switching Source writes the pending change for the first Source before the second is read", async () => {
    const first = createSourceResource({ name: "First" });
    const second = createSourceResource({ name: "Second" });
    const view = render(sectionFor(first));
    await screen.findByLabelText("Reference type");
    useFakeClock();
    type(/^title/i, "Tides");
    readCitationFields.mockClear();
    view.rerender(sectionFor(second));
    expect(writeCitationFields).toHaveBeenCalledTimes(1);
    expect(writeCitationFields).toHaveBeenCalledWith("p1", first.id, {
      referenceType: "book",
      title: "Tides",
    });
    expect(readCitationFields).toHaveBeenCalledWith("p1", second.id);
    expect(writeCitationFields.mock.invocationCallOrder[0]).toBeLessThan(
      readCitationFields.mock.invocationCallOrder[0],
    );
  });

  it("blocks the save while a field is invalid, marks it in text, and writes nothing", async () => {
    await renderEditor({ now: NOW });
    useFakeClock();
    type(/^title/i, "Tides");
    type(/^date/i, "2005-01-55");
    await advance(DEBOUNCE * 3);
    expect(writeCitationFields).not.toHaveBeenCalled();
    const date = screen.getByLabelText(/^date/i);
    expect(date.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/not a real date/i)).toBeTruthy();
    expect(
      screen
        .getAllByRole("status")
        .some((s: HTMLElement) => /not saved/i.test(s.textContent ?? "")),
    ).toBe(true);
  });

  it("blocks the save for a stored invalid value left unedited, while another field changes", async () => {
    readCitationFields.mockResolvedValue({
      kind: "fields",
      fields: { referenceType: "web-page", date: "2005-01-55" },
    });
    await renderEditor({ now: NOW });
    useFakeClock();
    type(/^title/i, "Tide Tables");
    await advance(DEBOUNCE * 3);
    expect(writeCitationFields).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^date/i).getAttribute("aria-invalid")).toBe(
      "true",
    );
  });

  it("resumes the save with everything typed once the field is corrected", async () => {
    await renderEditor({ now: NOW });
    useFakeClock();
    type(/^title/i, "Tides");
    type(/^date/i, "2005-01-55");
    await advance(DEBOUNCE * 2);
    expect(writeCitationFields).not.toHaveBeenCalled();
    type(/^date/i, "2005-01-05");
    await advance(DEBOUNCE - 1);
    expect(writeCitationFields).not.toHaveBeenCalled();
    await advance(1);
    expect(writeCitationFields).toHaveBeenCalledTimes(1);
    expect(writeCitationFields).toHaveBeenCalledWith("p1", "r1", {
      referenceType: "book",
      title: "Tides",
      date: "2005-01-05",
    });
  });

  it("on unmount with a field still invalid writes nothing and reports the changes as not saved", async () => {
    const onUnsavedOnLeave = vi.fn();
    const view = render(
      <CitationFieldsEditor
        projectId="p1"
        resourceId="r1"
        now={NOW}
        onUnsavedOnLeave={onUnsavedOnLeave}
      />,
    );
    await screen.findByLabelText("Reference type");
    useFakeClock();
    type(/^title/i, "Tides");
    type(/^date/i, "2005-01-55");
    view.unmount();
    expect(writeCitationFields).not.toHaveBeenCalled();
    expect(onUnsavedOnLeave).toHaveBeenCalledTimes(1);
    expect(String(onUnsavedOnLeave.mock.calls[0][0])).toMatch(/not saved/i);
  });

  it("does not report a not-saved message when an invalid stored value was left unedited", async () => {
    readCitationFields.mockResolvedValue({
      kind: "fields",
      fields: { referenceType: "web-page", date: "2005-01-55" },
    });
    const onUnsavedOnLeave = vi.fn();
    const view = render(
      <CitationFieldsEditor
        projectId="p1"
        resourceId="r1"
        now={NOW}
        onUnsavedOnLeave={onUnsavedOnLeave}
      />,
    );
    await screen.findByLabelText("Reference type");
    view.unmount();
    expect(onUnsavedOnLeave).not.toHaveBeenCalled();
    expect(writeCitationFields).not.toHaveBeenCalled();
  });

  it("switching Source with a field still invalid shows a visible not-saved message and writes nothing", async () => {
    const first = createSourceResource({ name: "First" });
    const second = createSourceResource({ name: "Second" });
    const view = render(sectionFor(first));
    await screen.findByLabelText("Reference type");
    useFakeClock();
    type(/^title/i, "Tides");
    type(/^date/i, "2005-01-55");
    view.rerender(sectionFor(second));
    expect(writeCitationFields).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/not saved/i);
    expect(alert.textContent).toContain("First");
  });

  it("a flush that fails on leaving reports the failure through the callback", async () => {
    writeCitationFields.mockResolvedValue({
      kind: "failed",
      message: "The citation fields could not be saved.",
    });
    const onUnsavedOnLeave = vi.fn();
    const view = render(
      <CitationFieldsEditor
        projectId="p1"
        resourceId="r1"
        now={NOW}
        onUnsavedOnLeave={onUnsavedOnLeave}
      />,
    );
    await screen.findByLabelText("Reference type");
    useFakeClock();
    type(/^title/i, "Tides");
    view.unmount();
    await advance(0);
    expect(onUnsavedOnLeave).toHaveBeenCalledTimes(1);
    expect(String(onUnsavedOnLeave.mock.calls[0][0])).toMatch(/not saved/i);
  });

  it("keeps every typed value after a failed save and shows role=alert", async () => {
    writeCitationFields.mockResolvedValue({
      kind: "failed",
      message: "The citation fields could not be saved.",
    });
    await renderEditor({ now: NOW });
    useFakeClock();
    type(/^title/i, "Tides");
    type(/^publisher/i, "Press");
    await settleSave();
    expect(screen.getByRole("alert").textContent).toContain(
      "could not be saved",
    );
    expect((screen.getByLabelText(/^title/i) as HTMLInputElement).value).toBe(
      "Tides",
    );
    expect(
      (screen.getByLabelText(/^publisher/i) as HTMLInputElement).value,
    ).toBe("Press");
  });
});
