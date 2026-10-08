import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { Provider } from "react-redux";
import SubtypeSection from "../../components/Sidebar/SubtypeSection";
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

const PROJECT_ID = "subtype-section-story-project";

interface StoryArgs {
  /** The project's ordered subtype list. */
  subtypes: string[];
  /** The resource's stored subtype, if any. */
  resourceSubtype?: string;
}

/**
 * Builds a story-scoped store with the project's subtype list and a single
 * selected text resource, mirroring `WordCountGoalSection.stories.tsx`.
 */
function buildStore({ subtypes, resourceSubtype }: StoryArgs) {
  const resource = {
    ...createTextResource({ name: "Chapter One" }),
    ...(resourceSubtype !== undefined ? { resourceSubtype } : {}),
  } as AnyResource;
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Subtype Story Project",
      rootPath: `/tmp/${PROJECT_ID}`,
      subtypes,
    } as Parameters<typeof setProject>[0]),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  store.dispatch(setResources([resource]));
  store.dispatch(setSelectedResourceId(resource.id));
  return store;
}

const meta: Meta<StoryArgs> = {
  title: "Sidebar/SubtypeSection",
  parameters: { a11y: { test: "error" } },
  render: (args: StoryArgs) => (
    <Provider store={buildStore(args)}>
      <SubtypeSection />
    </Provider>
  ),
};

export default meta;

type Story = StoryObj<StoryArgs>;

function select(canvasElement: HTMLElement): HTMLSelectElement {
  return within(canvasElement).getByRole("combobox", {
    name: "Subtype",
  }) as HTMLSelectElement;
}

/** The project has subtypes, the resource has none: "No subtype" is shown. */
export const NoSubtype: Story = {
  args: { subtypes: ["Scene", "Profile", "Aside"] },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await expect(select(canvasElement).selectedOptions[0]).toHaveTextContent(
      "No subtype",
    );
  },
};

/** The resource carries a subtype that is in the project list. */
export const Set: Story = {
  args: { subtypes: ["Scene", "Profile", "Aside"], resourceSubtype: "Profile" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await expect(select(canvasElement).value).toBe("Profile");
  },
};

/** The stored subtype is no longer in the list: shown as stale, still clearable. */
export const StaleSubtype: Story = {
  args: { subtypes: ["Scene", "Profile"], resourceSubtype: "Legacy" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await expect(select(canvasElement).selectedOptions[0]).toHaveTextContent(
      "Legacy (not in the current list)",
    );
  },
};

/** No subtypes defined and none stored: the control is disabled with a hint. */
export const EmptyList: Story = {
  args: { subtypes: [] },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await expect(select(canvasElement)).toBeDisabled();
    await expect(
      within(canvasElement).getByText(
        "No subtypes yet. Add them in Project Settings, Metadata tab.",
      ),
    ).toBeInTheDocument();
  },
};
