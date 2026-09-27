import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, within } from "storybook/test";
import { Provider } from "react-redux";
import WordCountGoalSection from "../../components/Sidebar/WordCountGoalSection";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import {
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import { createTextResource } from "../../src/lib/models/resource";
import type { AnyResource } from "../../src/lib/models/types";

const PROJECT_ID = "word-count-goal-story-project";

/**
 * `WordCountGoalSection` persists through `updateSidecar`
 * (`lib/api/resources.ts`), whose HTTP transport calls `fetch` directly.
 * Mocked at the `fetch` boundary, mirroring
 * `RemoveEntityControl.stories.tsx`'s `mockRemoveEntityFetch` — no real
 * filesystem I/O occurs.
 */
function mockSidecarFetch() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> =>
    ({ ok: true, json: async () => ({}) }) as Response;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

/**
 * Builds a story-scoped store with a single text resource preloaded and
 * selected, mirroring `wordCountGoalSection.test.tsx`'s `setupStore`.
 */
function buildStore(resource: AnyResource) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Word Count Goal Story Project",
      rootPath: `/tmp/${PROJECT_ID}`,
    }),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  store.dispatch(setResources([resource]));
  store.dispatch(setSelectedResourceId(resource.id));
  return store;
}

function renderSection(resource: AnyResource) {
  return (
    <Provider store={buildStore(resource)}>
      <WordCountGoalSection />
    </Provider>
  );
}

function input(canvasElement: HTMLElement): HTMLInputElement {
  return within(canvasElement).getByLabelText(
    "word-count-goal-input",
  ) as HTMLInputElement;
}

const meta: Meta<typeof WordCountGoalSection> = {
  title: "Sidebar/WordCountGoalSection",
  component: WordCountGoalSection,
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof WordCountGoalSection>;

/** No goal set yet: the input is empty and no progress bar renders. */
export const Empty: Story = {
  beforeEach: () => mockSidecarFetch(),
  render: () => renderSection(createTextResource({ name: "Chapter One" })),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await expect(input(canvasElement).value).toBe("");
    await expect(
      within(canvasElement).queryByRole("progressbar"),
    ).not.toBeInTheDocument();
  },
};

/** A previously-saved goal (with no current word count) prefills the input. */
export const Filled: Story = {
  beforeEach: () => mockSidecarFetch(),
  render: () => {
    const resource = createTextResource({ name: "Chapter One" });
    Object.assign(resource, { wordCountGoal: 2000 });
    return renderSection(resource);
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await expect(input(canvasElement).value).toBe("2000");
  },
};

/**
 * A negative value is rejected client-side with an accessible `role="alert"`
 * message and no request sent, the same validation path
 * `wordCountGoalSection.test.tsx` exercises.
 */
export const Error: Story = {
  beforeEach: () => mockSidecarFetch(),
  render: () => renderSection(createTextResource({ name: "Chapter One" })),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    fireEvent.change(input(canvasElement), { target: { value: "-5" } });
    const alert = await canvas.findByRole("alert");
    await expect(alert).toHaveTextContent(/non-negative whole number/i);
  },
};

/**
 * A resource with both a goal and a current word count renders
 * `WordCountProgressBar` (Task 6) — this is the fourth state this section
 * has that `WordCountGoalField` does not.
 */
export const WithProgressBar: Story = {
  beforeEach: () => mockSidecarFetch(),
  render: () => {
    const resource = createTextResource({ name: "Chapter One" });
    Object.assign(resource, {
      wordCountGoal: 2000,
      userMetadata: { wordCount: 1234 },
    });
    return renderSection(resource);
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const bar = canvas.getByRole("progressbar");
    await expect(bar).toHaveAttribute("aria-valuemax", "2000");
    await expect(bar).toHaveAttribute("aria-valuenow", "1234");
  },
};
