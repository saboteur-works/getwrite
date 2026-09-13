/**
 * StartPage's desktop-only Scrivener import launcher (Task 9, Feature 43).
 *
 * The Import control must be absent — not merely disabled — when there is no
 * desktop bridge (mirrors `WorkspaceLocationSettings.tsx`'s `if (!bridge)
 * return null` pattern; see `tests/workspaceLocationSettings.test.tsx` and
 * `tests/component/ImportScrivenerDialog.test.tsx` for the same
 * install-a-fake-bridge-on-`window` convention used here).
 *
 * `StartPage` itself never calls `chooseScrivenerSource` — that call is
 * entirely internal to `ImportScrivenerDialog` (Task 8) — so opening the
 * dialog from here must not trigger it.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server.node";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import StartPage from "../../components/Start/StartPage";
import { makeStore } from "../../src/store/store";
import type {
  ScrivenerImportOutcome,
  ScrivenerSourceChoice,
} from "../../src/lib/desktop-bridge";

/**
 * Installs a fake desktop bridge on `window`, mirroring
 * `ImportScrivenerDialog.test.tsx`'s `installBridge` helper.
 *
 * @param overrides - Spies to use in place of the defaults.
 * @returns The bridge's spies.
 */
function installBridge(overrides: {
  chooseScrivenerSource?: ReturnType<typeof vi.fn>;
  startScrivenerImport?: ReturnType<typeof vi.fn>;
}) {
  const chooseScrivenerSource =
    overrides.chooseScrivenerSource ??
    vi.fn(
      async (): Promise<ScrivenerSourceChoice> => ({
        ok: true,
        handle: "handle-1",
        displayName: "My Novel",
      }),
    );
  const startScrivenerImport =
    overrides.startScrivenerImport ??
    vi.fn(
      async (): Promise<ScrivenerImportOutcome> => ({
        kind: "success",
        projectId: "proj-imported",
        projectRoot: "/tmp/proj-imported",
        folderCount: 1,
        resourceCount: 1,
        tagCount: 0,
        report: "Report body",
      }),
    );
  (window as unknown as Record<string, unknown>).getwriteDesktop = {
    getWorkspaceDir: vi.fn(async () => "/tmp"),
    chooseWorkspaceDir: vi.fn(async () => ({ ok: false, cancelled: true })),
    restart: vi.fn(async () => {}),
    chooseScrivenerSource,
    startScrivenerImport,
  };
  return { chooseScrivenerSource, startScrivenerImport };
}

/** Renders `StartPage` inside a fresh Redux store, as `start.test.tsx` does. */
function renderStartPage(props: React.ComponentProps<typeof StartPage> = {}) {
  const store = makeStore();
  return render(
    <Provider store={store}>
      <StartPage projects={[]} {...props} />
    </Provider>,
  );
}

beforeEach(() => {
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
  vi.restoreAllMocks();
});

describe("StartPage — Scrivener import launcher", () => {
  it("renders no Import control when there is no desktop bridge", () => {
    renderStartPage();

    expect(
      screen.queryByRole("button", { name: /Import/i }),
    ).not.toBeInTheDocument();
  });

  it("renders an Import control when a desktop bridge is present", () => {
    installBridge({});
    renderStartPage();

    expect(
      screen.getByRole("button", { name: /Import from Scrivener/i }),
    ).toBeInTheDocument();
  });

  it("opens ImportScrivenerDialog in choose-source without calling chooseScrivenerSource itself", async () => {
    const { chooseScrivenerSource } = installBridge({});
    renderStartPage();
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /Import from Scrivener/i }),
    );

    expect(
      screen.getByRole("heading", { name: /Import from Scrivener/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Choose Scrivener project/i }),
    ).toBeInTheDocument();
    expect(chooseScrivenerSource).not.toHaveBeenCalled();
  });

  it("calls onImportComplete with the new project id once the dialog reports success", async () => {
    installBridge({});
    const onImportComplete = vi.fn();
    renderStartPage({ onImportComplete });
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /Import from Scrivener/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /Choose Scrivener project/i }),
    );
    await screen.findByLabelText(/Name/i);
    await user.click(screen.getByRole("button", { name: /^Start$/i }));

    const openButton = await screen.findByRole("button", {
      name: /Open Project/i,
    });
    await user.click(openButton);

    expect(onImportComplete).toHaveBeenCalledWith("proj-imported");
    // The dialog closes itself once the callback has fired.
    expect(
      screen.queryByRole("heading", { name: /Import from Scrivener/i }),
    ).not.toBeInTheDocument();
  });

  it("agrees with its own SSR markup on first render, then reveals Import post-mount, when a desktop bridge is present (hydration-mismatch regression)", async () => {
    installBridge({});

    // Simulate the server-rendered HTML. `window.getwriteDesktop` is
    // installed above to mirror the Electron client environment, but a real
    // Next.js server render never sees it — the server has no `window` at
    // all. Detecting the bridge synchronously during render (the pre-fix
    // `useMemo` approach) would make this SSR-equivalent string disagree
    // with the client's first render, since the bridge stub is already
    // present on `window` by the time client rendering starts.
    const store = makeStore();
    const ssrMarkup = renderToString(
      <Provider store={store}>
        <StartPage projects={[]} />
      </Provider>,
    );
    expect(ssrMarkup).not.toContain('aria-label="Import from Scrivener"');

    // A normal client render (with the same bridge stub present) must still
    // reveal the Import control once its mount effect resolves the bridge —
    // the SSR-agreement fix above must not regress the desktop behavior.
    renderStartPage();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Import from Scrivener/i }),
      ).toBeInTheDocument();
    });
  });
});
