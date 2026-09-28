import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import { Provider } from "react-redux";
import ProseDiagnosticsSection from "../../components/Sidebar/ProseDiagnosticsSection";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { createTextResource } from "../../src/lib/models/resource";
import type { TextResource } from "../../src/lib/models/types";

const PROJECT_ID = "prose-diagnostics-story-project";

/**
 * `ProseDiagnosticsSection` reads through `getProseDiagnosticsOrThrow`
 * (`lib/api/prose-diagnostics.ts`, Task 14), whose HTTP transport calls `fetch`
 * directly. Mocked at the `fetch` boundary, mirroring
 * `WordCountGoalSection.stories.tsx`'s `mockSidecarFetch` — no real
 * filesystem I/O occurs, and this codebase has no established
 * per-story mechanism for mocking a `lib/api/*` module directly (Vitest's
 * `vi.mock` is unavailable to the Storybook Vite build; see
 * `TrashView.stories.tsx`'s doc comment).
 */
function mockDiagnosticsFetch(respond: () => Promise<Response>): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = respond;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

/** Builds a story-scoped store with the active project set. */
function buildStore() {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Prose Diagnostics Story Project",
      rootPath: `/tmp/${PROJECT_ID}`,
    }),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  return store;
}

function renderSection(resource: TextResource) {
  return (
    <Provider store={buildStore()}>
      <ProseDiagnosticsSection resource={resource} />
    </Provider>
  );
}

const meta: Meta<typeof ProseDiagnosticsSection> = {
  title: "Sidebar/ProseDiagnosticsSection",
  component: ProseDiagnosticsSection,
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof ProseDiagnosticsSection>;

/**
 * On mount, before the fetch resolves: the loading status message renders
 * (never a silent blank per `docs/standards/failure-visibility.md`).
 */
export const Loading: Story = {
  beforeEach: () => mockDiagnosticsFetch(() => new Promise(() => {})),
  render: () => renderSection(createTextResource({ name: "Chapter One" })),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent(/loading/i);
  },
};

/** The fetch resolves with a diagnostics summary: the three metrics render. */
export const Ready: Story = {
  beforeEach: () =>
    mockDiagnosticsFetch(() =>
      Promise.resolve(
        jsonResponse({
          dialogueRatio: 0.25,
          averageSentenceLength: 14.2,
          topRepeatedWords: [
            { word: "the", count: 40 },
            { word: "and", count: 22 },
          ],
        }),
      ),
    ),
  render: () => renderSection(createTextResource({ name: "Chapter One" })),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.queryByRole("status")).not.toBeInTheDocument(),
    );
    await expect(canvas.getByText(/dialogue ratio/i)).toBeInTheDocument();
    await expect(canvas.getByText(/25%/)).toBeInTheDocument();
    await expect(
      canvas.getByText(/average sentence length/i),
    ).toBeInTheDocument();
    await expect(canvas.getByText(/the \(40\)/)).toBeInTheDocument();
  },
};

/**
 * The error state, reached here through the component's own
 * `!projectId || !resourceId` guard (`ProseDiagnosticsSection.tsx`) rather
 * than a fetch failure: the real HTTP transport
 * (`lib/api/prose-diagnostics.ts`) catches every failure mode itself and
 * degrades to `EMPTY_PROSE_DIAGNOSTICS` rather than rejecting, so a
 * fetch-level mock alone cannot reach this branch — the guard is the only
 * reachable path to it from outside the module.
 */
export const Error: Story = {
  beforeEach: () => mockDiagnosticsFetch(() => new Promise(() => {})),
  render: () => {
    const resource = createTextResource({ name: "Chapter One" });
    Object.assign(resource, { id: "" });
    return renderSection(resource);
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent(/couldn't load/i);
  },
};
