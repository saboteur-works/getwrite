import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import ProseDiagnosticsDetailDialog from "../../components/Sidebar/ProseDiagnosticsDetailDialog";

const PROJECT_ID = "prose-diagnostics-dialog-story-project";
const RESOURCE_ID = "prose-diagnostics-dialog-story-resource";

/**
 * `ProseDiagnosticsDetailDialog` reads through `getProseDiagnosticsDetail`
 * (`lib/api/prose-diagnostics.ts`), whose HTTP transport calls `fetch`
 * directly. Mocked at the `fetch` boundary, mirroring
 * `ProseDiagnosticsSection.stories.tsx`'s `mockDiagnosticsFetch` — no real
 * filesystem I/O occurs, and this codebase has no established per-story
 * mechanism for mocking a `lib/api/*` module directly (see
 * `TrashView.stories.tsx`'s doc comment).
 */
function mockDetailFetch(respond: () => Promise<Response>): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = respond;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

/**
 * Harness supplying the `returnFocusRef` the real component requires (the
 * button that opened it) and toggling `isOpen` locally, mirroring
 * `ConfirmDialog.stories.tsx`'s `Interactive` story's own local-state
 * pattern for a controlled overlay.
 */
function DialogHarness({ initialOpen }: { initialOpen: boolean }): JSX.Element {
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = React.useState(initialOpen);
  return (
    <>
      <button ref={buttonRef} type="button" onClick={() => setIsOpen(true)}>
        Show detail
      </button>
      <ProseDiagnosticsDetailDialog
        isOpen={isOpen}
        projectId={PROJECT_ID}
        resourceId={RESOURCE_ID}
        onClose={() => setIsOpen(false)}
        returnFocusRef={buttonRef}
      />
    </>
  );
}

const meta: Meta<typeof ProseDiagnosticsDetailDialog> = {
  title: "Sidebar/ProseDiagnosticsDetailDialog",
  component: ProseDiagnosticsDetailDialog,
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof ProseDiagnosticsDetailDialog>;

/** Closed: only the opening button renders, no overlay and no fetch. */
export const Closed: Story = {
  beforeEach: () => mockDetailFetch(() => new Promise(() => {})),
  render: () => <DialogHarness initialOpen={false} />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: /show detail/i }),
    ).toBeInTheDocument();
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
  },
};

/** Open, before the fetch resolves: the loading status message renders. */
export const Loading: Story = {
  beforeEach: () => mockDetailFetch(() => new Promise(() => {})),
  render: () => <DialogHarness initialOpen />,
  play: async () => {
    await expect(
      within(document.body).getByText(/loading located repeated words/i),
    ).toBeInTheDocument();
  },
};

/** Open, the fetch resolves with results: the located words and positions render. */
export const Ready: Story = {
  beforeEach: () =>
    mockDetailFetch(() =>
      Promise.resolve(
        jsonResponse({
          locatedRepeatedWords: [
            { word: "the", count: 3, offsets: [0, 10, 20] },
            { word: "and", count: 2, offsets: [5, 15] },
          ],
        }),
      ),
    ),
  render: () => <DialogHarness initialOpen />,
  play: async () => {
    const body = within(document.body);
    await waitFor(() =>
      expect(body.getByText(/the \(3\)/)).toBeInTheDocument(),
    );
    await expect(body.getByText(/0, 10, 20/)).toBeInTheDocument();
    await expect(body.getByText(/and \(2\)/)).toBeInTheDocument();
  },
};

/**
 * Open, the fetch resolves with zero located results: the "no results"
 * message renders.
 *
 * This stands in for the dialog's `error` discriminated state, which is
 * unreachable from any Storybook-story-level `fetch` mock: the real HTTP
 * transport (`getProseDiagnosticsDetail` in `lib/api/prose-diagnostics.ts`)
 * wraps its entire body in a `try`/`catch` and degrades to
 * `EMPTY_PROSE_DIAGNOSTICS_DETAIL` on every failure mode (non-2xx response,
 * network error, or malformed body) rather than rejecting, and, unlike
 * `ProseDiagnosticsSection`, this dialog has no `projectId`/`resourceId`
 * guard of its own to reach `error` through instead. The `error` state is
 * exercised in `tests/proseDiagnosticsDetailDialog.test.tsx` by mocking the
 * `lib/api/prose-diagnostics` module directly via `vi.mock`, a mechanism
 * unavailable to the Storybook Vite build (see
 * `TrashView.stories.tsx`'s doc comment).
 */
export const NoResultsFound: Story = {
  beforeEach: () =>
    mockDetailFetch(() =>
      Promise.resolve(jsonResponse({ locatedRepeatedWords: [] })),
    ),
  render: () => <DialogHarness initialOpen />,
  play: async () => {
    const body = within(document.body);
    await waitFor(() =>
      expect(body.getByText(/no repeated words found/i)).toBeInTheDocument(),
    );
  },
};
