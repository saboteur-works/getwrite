/** @vitest-environment jsdom */
/**
 * Feature 116, Task 20 (FR-5, FR-7, FR-23): the citation fields editor.
 * The Task 19 client is mocked; no network is touched.
 */
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CitationFieldsEditor from "../../components/Sidebar/CitationFieldsEditor";
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

afterEach(cleanup);

async function renderEditor(
  extra: Partial<React.ComponentProps<typeof CitationFieldsEditor>> = {},
): Promise<void> {
  render(<CitationFieldsEditor projectId="p1" resourceId="r1" {...extra} />);
  await screen.findByLabelText("Reference type");
}

function clickSave(): void {
  fireEvent.click(screen.getByRole("button", { name: "Save citation fields" }));
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
    clickSave();
    await waitFor(() => expect(writeCitationFields).toHaveBeenCalledTimes(1));
    expect(writeCitationFields).toHaveBeenCalledWith("p1", "r1", {
      referenceType: "book",
      authors: [{ family: "Hale", given: "Ada" }, { literal: "Tide Board" }],
      title: "Tides",
    });
    expect((await screen.findByRole("status")).textContent).toMatch(/saved/i);
  });

  it("omits empty fields so an incomplete Source is savable", async () => {
    await renderEditor();
    clickSave();
    await waitFor(() => expect(writeCitationFields).toHaveBeenCalled());
    expect(writeCitationFields).toHaveBeenCalledWith("p1", "r1", {
      referenceType: "book",
    });
  });

  it("does not call the client for a malformed date and says so in an alert", async () => {
    await renderEditor();
    fireEvent.change(screen.getByLabelText(/^date/i), {
      target: { value: "next week" },
    });
    clickSave();
    expect((await screen.findByRole("alert")).textContent).toMatch(/YYYY/);
    expect(writeCitationFields).not.toHaveBeenCalled();
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
      screen.queryByRole("button", { name: "Save citation fields" }),
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
    fireEvent.change(screen.getByLabelText(/^title/i), {
      target: { value: "Tides" },
    });
    clickSave();
    expect((await screen.findByRole("alert")).textContent).toContain(
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
    const save = screen.getByRole("button", { name: "Save citation fields" });
    save.focus();
    expect(document.activeElement).toBe(save);
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
