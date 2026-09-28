import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "../../src/store/store";
import TrashRefreshProvider from "../../components/Layout/TrashRefreshContext";

/**
 * Regression coverage for POS task_2efa1eca: `page.tsx` built the local
 * `selectedProject` state it passes to `AppShell` with
 * `config: { wordCountGoal, dailyWordGoal }` only, dropping every other
 * config field — including `defaultRevisionName`, which `AppShell.tsx`
 * reads as `project?.config?.defaultRevisionName ?? "Initial Draft"` for the
 * Project Settings "Default Revision Name" field's initial value. A saved
 * default revision name was therefore never reflected there; the field
 * always showed the "Initial Draft" fallback.
 *
 * `AppShell` is stubbed out (as `page-delete-failure.test.tsx` and
 * `page-open-failure.test.tsx` do) so this reaches `page.tsx`'s
 * project-building logic directly via the captured `project` prop, without
 * reimplementing Project Settings' own dialog wiring.
 */

vi.mock("../../src/lib/api/projects", () => ({
  listProjects: vi.fn().mockResolvedValue([]),
  openProject: vi
    .fn()
    .mockResolvedValue({
      project: {
        id: "project-internal-id",
        name: "Test Project",
        rootPath: "/projects/proj-dir-id",
        config: { defaultRevisionName: "Chapter Draft" },
      },
      folders: [],
      resources: [],
    }),
}));

type CapturedAppShellProps = {
  project?: { config?: { defaultRevisionName?: string } } | null;
  children?: React.ReactNode;
};

vi.mock("../../components/Layout/AppShell", () => ({
  __esModule: true,
  default: (props: CapturedAppShellProps) => (
    <div>
      <div data-testid="default-revision-name">
        {props.project?.config?.defaultRevisionName ?? "(none)"}
      </div>
      {props.children}
    </div>
  ),
}));

function MockStartPage(props: { onOpen?: (id: string) => void }) {
  React.useEffect(() => {
    props.onOpen?.("proj-dir-id");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

vi.mock("../../components/Start/StartPage", () => ({
  __esModule: true,
  default: (props: { onOpen?: (id: string) => void }) => (
    <MockStartPage {...props} />
  ),
}));

// Same rationale as page-delete-failure.test.tsx.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes("entity-alias-table")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ entities: {}, claimedBy: {} }),
        } as Response;
      }
      throw new Error("not available in test");
    }),
  );
});

describe("page.tsx open branch (POS task_2efa1eca)", () => {
  it("carries config.defaultRevisionName through to the AppShell project prop", async () => {
    const { default: Page } = await import("../../app/(app)/page");
    const store = makeStore();
    render(
      <Provider store={store}>
        <TrashRefreshProvider>
          <Page />
        </TrashRefreshProvider>
      </Provider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("default-revision-name")).toHaveTextContent(
        "Chapter Draft",
      ),
    );
  });
});
