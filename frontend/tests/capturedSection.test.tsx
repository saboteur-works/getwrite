import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import CapturedSection from "../components/Sidebar/CapturedSection";
import MetadataSidebar from "../components/Sidebar/MetadataSidebar";
import TrashRefreshProvider from "../components/Layout/TrashRefreshContext";
import { createTextResource } from "../src/lib/models/resource";
import { makeStore } from "../src/store/store";
import {
  setResources,
  setSelectedResourceId,
} from "../src/store/resourcesSlice";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import type { AnyResource } from "../src/lib/models/types";
import { flushPendingEffects } from "./helpers/flushEffects";
import { runAxe } from "./a11y/helpers/axe";

vi.mock("../src/lib/api/prose-diagnostics", () => ({
  getProseDiagnosticsOrThrow: vi
    .fn()
    .mockResolvedValue({
      dialogueRatio: 0,
      averageSentenceLength: 0,
      topRepeatedWords: [],
    }),
}));

const ISO = "2026-11-09T14:30:00.000Z";

function captured(extra: Partial<AnyResource>): AnyResource {
  return {
    ...createTextResource({ name: "Idea", plainText: "an idea" }),
    ...extra,
  } as AnyResource;
}

afterEach(() => vi.restoreAllMocks());

// Feature 106, Task 24 (FR-22): read-only capture time and link.
describe("CapturedSection (Task 24)", () => {
  it("shows a Captured block with the locale-formatted time and the ISO value as dateTime and title", () => {
    render(<CapturedSection resource={captured({ capturedAt: ISO })} />);
    const group = screen.getByRole("group", { name: "Captured" });
    const time = group.querySelector("time") as HTMLTimeElement;
    expect(time).not.toBeNull();
    expect(time.getAttribute("datetime")).toBe(ISO);
    expect(time.getAttribute("title")).toBe(ISO);
    expect(time.textContent).toBe(new Date(ISO).toLocaleString());
  });

  it("shows an http(s) link as a read-only anchor with no opener", () => {
    render(
      <CapturedSection
        resource={captured({ capturedLink: "https://example.com/a?b=1" })}
      />,
    );
    const a = screen.getByRole("link", { name: "https://example.com/a?b=1" });
    expect(a.getAttribute("href")).toBe("https://example.com/a?b=1");
    expect(a.getAttribute("rel")).toContain("noopener");
    expect(a.getAttribute("rel")).toContain("noreferrer");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hi",
    "file:///etc/passwd",
    "not a url",
    "ftp://example.com",
  ])("shows %s as plain text, not a link", (link) => {
    render(<CapturedSection resource={captured({ capturedLink: link })} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(link)).toBeInTheDocument();
  });

  it("falls back to the raw value for an unparseable capturedAt", () => {
    render(<CapturedSection resource={captured({ capturedAt: "garbage" })} />);
    expect(screen.getByText("garbage")).toBeInTheDocument();
  });

  it("renders nothing for a resource with neither key", () => {
    const { container } = render(<CapturedSection resource={captured({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("has no control that can change either key", () => {
    const { container } = render(
      <CapturedSection
        resource={captured({
          capturedAt: ISO,
          capturedLink: "https://example.com",
        })}
      />,
    );
    expect(
      container.querySelectorAll(
        "input, textarea, select, button, [contenteditable]",
      ),
    ).toHaveLength(0);
  });

  it("makes no network request on render", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <CapturedSection
        resource={captured({
          capturedAt: ISO,
          capturedLink: "https://example.com",
        })}
      />,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("has no axe violations (both, time only, text link)", async () => {
    for (const extra of [
      { capturedAt: ISO, capturedLink: "https://example.com" },
      { capturedAt: ISO },
      { capturedLink: "javascript:alert(1)" },
    ]) {
      const { container, unmount } = render(
        <CapturedSection resource={captured(extra)} />,
      );
      await runAxe(container);
      unmount();
    }
  });
});

describe("MetadataSidebar capture block (Task 24)", () => {
  function mount(res: AnyResource): void {
    const store = makeStore();
    store.dispatch(
      setProject({ id: "p", rootPath: "/test" } as Parameters<
        typeof setProject
      >[0]),
    );
    store.dispatch(setSelectedProjectId("p"));
    store.dispatch(setResources([res]));
    store.dispatch(setSelectedResourceId(res.id));
    render(
      <Provider store={store}>
        <TrashRefreshProvider>
          <MetadataSidebar />
        </TrashRefreshProvider>
      </Provider>,
    );
  }

  it("shows the block for a captured item", async () => {
    mount(captured({ capturedAt: ISO, capturedLink: "https://example.com" }));
    await flushPendingEffects();
    const sidebar = screen.getByLabelText("metadata-sidebar");
    expect(
      within(sidebar).getByRole("group", { name: "Captured" }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole("link", { name: "https://example.com" }),
    ).toBeInTheDocument();
  });

  it("shows no block for an ordinary resource", async () => {
    mount(captured({}));
    await flushPendingEffects();
    expect(
      screen.queryByRole("group", { name: "Captured" }),
    ).not.toBeInTheDocument();
  });
});
