import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "../../src/store/store";
import TrashRefreshProvider from "../../components/Layout/TrashRefreshContext";

/**
 * Regression coverage for POS task_8898ff5e: `page.tsx`'s `onOpen` wiring to
 * `StartPage` passed `handleOpen` directly. `handleOpen` is async and can
 * throw; passed as a plain `(id: string) => void` prop, a click fired it
 * unawaited from a synchronous handler, so a rejection (a locked or missing
 * project, a network failure) became an unhandled promise rejection with no
 * visible error — the writer's click appeared to do nothing.
 *
 * `StartPage` is stubbed out (as `page-delete-failure.test.tsx` does) so this
 * reaches `page.tsx`'s `onOpen` prop directly via a captured click, without
 * reimplementing the real Start-page card markup.
 */

const openProjectMock = vi.fn();

vi.mock("../../src/lib/api/projects", () => ({
  listProjects: vi.fn().mockResolvedValue([]),
  openProject: (...args: unknown[]) => openProjectMock(...args),
}));

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("../../src/lib/toast-service", () => ({
  toastService: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
    loading: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
    dismissAll: vi.fn(),
  },
}));

vi.mock("../../components/Start/StartPage", () => ({
  __esModule: true,
  default: (props: { onOpen?: (id: string) => void }) => (
    <button onClick={() => props.onOpen?.("proj-dir-id")}>open-project</button>
  ),
}));

// Same rationale as page-delete-failure.test.tsx: `checkWorkspaceLock` fires
// a real fetch on mount, and the entity-alias-table read must be answered
// rather than rejected so it doesn't fire its own unrelated toast.
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
  openProjectMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

async function renderStartPage() {
  const { default: Page } = await import("../../app/(app)/page");
  const store = makeStore();
  render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <Page />
      </TrashRefreshProvider>
    </Provider>,
  );
  await waitFor(() => screen.getByText("open-project"));
  return store;
}

describe("page.tsx open branch (POS task_8898ff5e)", () => {
  it("shows an error toast, not an unhandled rejection, when opening a project fails", async () => {
    const unhandled: unknown[] = [];
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      unhandled.push(event.reason);
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    openProjectMock.mockRejectedValueOnce(new Error("Project locked"));
    await renderStartPage();

    fireEvent.click(screen.getByText("open-project"));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Cannot open project",
      "Project locked",
    );

    // Give a rejected microtask a turn to surface as unhandled, if it were
    // going to; the catch in `handleOpenFromStartPage` should prevent that.
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    expect(unhandled).toHaveLength(0);
  });
});
