/** @vitest-environment jsdom */
/**
 * Feature 116, Task 21 (FR-4, FR-7, FR-8, FR-19): the sidebar section that
 * mounts the citation fields editor for a Source while the Citations module
 * is on, independent of the Sources switch. The Task 19 client is mocked.
 */
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CitationFieldsSection, {
  CITATION_FIELDS_NATIVE_MESSAGE,
} from "../../components/Sidebar/CitationFieldsSection";
import { StaticModulesProvider } from "../../components/Modules/ModulesContext";
import { createTextResource } from "../../src/lib/models/resource";
import { createSourceResource } from "../../src/lib/models/resource-factory";
import type { AnyResource } from "../../src/lib/models/types";
import { makeStore } from "../../src/store/store";

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

const STORED = { referenceType: "book", title: "A Stored Title" };

beforeEach(() => {
  readCitationFields.mockReset();
  writeCitationFields.mockReset();
  readCitationFields.mockResolvedValue({ kind: "fields", fields: STORED });
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function ui(
  resource: AnyResource,
  modules: Record<string, boolean> | undefined,
): JSX.Element {
  return (
    <Provider store={makeStore()}>
      <StaticModulesProvider value={modules}>
        <CitationFieldsSection projectId="p1" resource={resource} />
      </StaticModulesProvider>
    </Provider>
  );
}

const source = (): AnyResource => createSourceResource({ name: "Book" });

describe("CitationFieldsSection", () => {
  it("shows the editor for a Source while the module is on", async () => {
    render(ui(source(), { citations: true }));
    expect(await screen.findByLabelText("Reference type")).toBeInTheDocument();
    expect(readCitationFields).toHaveBeenCalledWith("p1", expect.any(String));
  });

  it("still shows with the Sources module off and Citations on", async () => {
    render(ui(source(), { sources: false, citations: true }));
    expect(await screen.findByLabelText("Reference type")).toBeInTheDocument();
  });

  it("renders nothing and makes no request while the module is off", () => {
    const { container } = render(ui(source(), { citations: false }));
    expect(container).toBeEmptyDOMElement();
    const absent = render(ui(source(), undefined));
    expect(absent.container).toBeEmptyDOMElement();
    expect(readCitationFields).not.toHaveBeenCalled();
    expect(writeCitationFields).not.toHaveBeenCalled();
  });

  it("is not offered on a text resource", () => {
    const { container } = render(
      ui(createTextResource({ name: "Ch", plainText: "" }), {
        citations: true,
      }),
    );
    expect(container).toBeEmptyDOMElement();
    expect(readCitationFields).not.toHaveBeenCalled();
  });

  it("is not offered on an image, audio or folder-like resource", () => {
    for (const type of ["image", "audio", "folder"]) {
      const { container } = render(
        ui({ id: "x", name: "n", type } as unknown as AnyResource, {
          citations: true,
        }),
      );
      expect(container).toBeEmptyDOMElement();
    }
    expect(readCitationFields).not.toHaveBeenCalled();
  });

  it("switching off then on shows the same stored values and writes nothing", async () => {
    const view = render(ui(source(), { citations: true }));
    await screen.findByDisplayValue("A Stored Title");
    view.rerender(ui(source(), { citations: false }));
    expect(screen.queryByDisplayValue("A Stored Title")).toBeNull();
    view.rerender(ui(source(), { citations: true }));
    expect(await screen.findByDisplayValue("A Stored Title")).toBeVisible();
    expect(writeCitationFields).not.toHaveBeenCalled();
  });

  it("writes nothing on open", async () => {
    render(ui(source(), { citations: true }));
    await screen.findByDisplayValue("A Stored Title");
    expect(writeCitationFields).not.toHaveBeenCalled();
  });

  it("on the native runtime shows the sentence, no inputs and makes no request", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(ui(source(), { citations: true }));
    expect(
      screen.getByText("Citation fields can be edited on desktop and web"),
    ).toBeInTheDocument();
    expect(CITATION_FIELDS_NATIVE_MESSAGE).toBe(
      "Citation fields can be edited on desktop and web",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    await waitFor(() => undefined);
    expect(readCitationFields).not.toHaveBeenCalled();
    expect(writeCitationFields).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("on the native runtime with the module off shows nothing", () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    const { container } = render(ui(source(), { citations: false }));
    expect(container).toBeEmptyDOMElement();
  });
  it("names the details still missing, and follows typing before any save", async () => {
    render(ui(source(), { citations: true }));
    const line = await screen.findByText(
      "Still needs: Authors, Publisher, Date",
    );
    expect(line.getAttribute("role")).toBe("status");
    fireEvent.change(screen.getByLabelText("Publisher"), {
      target: { value: "Penguin" },
    });
    expect(screen.getByText("Still needs: Authors, Date")).toBeInTheDocument();
    expect(writeCitationFields).not.toHaveBeenCalled();
  });

  it("states that nothing is missing when complete", async () => {
    readCitationFields.mockResolvedValue({
      kind: "fields",
      fields: {
        referenceType: "book",
        authors: [{ family: "Shaw", given: "A" }],
        title: "T",
        publisher: "P",
        date: "2020",
      },
    });
    render(ui(source(), { citations: true }));
    expect(
      await screen.findByText("Nothing is missing for this style."),
    ).toBeInTheDocument();
  });

  it("changes the line when the reference type changes", async () => {
    render(ui(source(), { citations: true }));
    await screen.findByText("Still needs: Authors, Publisher, Date");
    fireEvent.change(screen.getByLabelText("Reference type"), {
      target: { value: "interview" },
    });
    expect(
      screen.getByText("Still needs: Interviewee, Interviewer, Date"),
    ).toBeInTheDocument();
  });

  it("has exactly one status region for the line", async () => {
    render(ui(source(), { citations: true }));
    await screen.findByText("Still needs: Authors, Publisher, Date");
    const regions = screen
      .getAllByRole("status")
      .filter((el: HTMLElement) =>
        /still needs|nothing is missing/i.test(el.textContent ?? ""),
      );
    expect(regions).toHaveLength(1);
    expect(regions[0].textContent).toBe(
      "Still needs: Authors, Publisher, Date",
    );
  });

  it("shows no line and the editor failure on a failed read", async () => {
    readCitationFields.mockResolvedValue({ kind: "failed", message: "boom" });
    render(ui(source(), { citations: true }));
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    expect(screen.queryByText(/still needs/i)).toBeNull();
    expect(screen.queryByText(/nothing is missing/i)).toBeNull();
  });
});
