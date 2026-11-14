import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { Provider } from "react-redux";
import NarrativesView from "../../components/Folklore/NarrativesView";
import type { NarrativeListDeps } from "../../components/Folklore/useNarrativeList";
import type { VariantTextsDeps } from "../../components/Folklore/useVariantTexts";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setFolders, setResources } from "../../src/store/resourcesSlice";
import { ProjectLockedError } from "../../src/lib/models/locked-access";
import type { AnyResource, Folder } from "../../src/lib/models/types";

/**
 * The Narratives tab (Feature 110): picker, list and comparison for one
 * narrative, with the states the tab names in text. The reads are fakes passed
 * through `deps`, so the stories are not evidence about the real routes or a
 * device. The tab lists, compares and opens only. Variants are ticked in the
 * list and "Compare (N)" opens the comparison at the tab's full width. Narrow
 * the viewport below 768px to see the list stay and the Compare button give
 * way to the phone message.
 */

const PROJECT_DIR = "narratives-story-project";

function folder(id: string, name: string, order: number): Folder {
  return {
    id,
    slug: id,
    name,
    type: "folder",
    orderIndex: order,
    parentId: null,
  } as unknown as Folder;
}

function variant(id: string, order: number, over = {}): AnyResource {
  return {
    id,
    slug: id,
    name: `Telling ${id.toUpperCase()}`,
    type: "source",
    folderId: "n1",
    orderIndex: order,
    resourceSubtype: "Variant",
    ...over,
  } as unknown as AnyResource;
}

const NARRATIVE_FOLDERS = [folder("n1", "Cinderella", 0)];
const VARIANTS = [
  variant("a", 0),
  variant("b", 1),
  variant("c", 2, { resourceSubtype: "Other" }),
];

type Subtypes = Record<string, string | undefined | Error>;

function listDeps(subtypes: Subtypes, isPending = false): NarrativeListDeps {
  return {
    getFolderMetadata: async (_projectId, id) => {
      if (isPending) return new Promise(() => undefined);
      const v = subtypes[id];
      if (v instanceof Error) throw v;
      return { notes: "", fieldValues: {}, resourceSubtype: v };
    },
  };
}

const TEXT_DEPS: VariantTextsDeps = {
  readVariantText: async (_projectId, resourceId) => ({
    kind: "text",
    text: JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: `Text of ${resourceId}. A river, a mill.` },
          ],
        },
      ],
    }),
  }),
  listAttachments: async () => [],
};

interface StoryArgs {
  folders: Folder[];
  resources: AnyResource[];
  subtypes: Subtypes;
  isPending?: boolean;
  openInEditor: (id: string) => void;
}

function Harness(args: StoryArgs): React.ReactElement {
  const [store] = React.useState(() => {
    window.localStorage.removeItem(
      `getwrite-folklore-selection:${PROJECT_DIR}`,
    );
    const s = makeStore();
    s.dispatch(
      setProject({
        id: PROJECT_DIR,
        rootPath: `/projects/${PROJECT_DIR}`,
        name: "Story project",
      }),
    );
    s.dispatch(setSelectedProjectId(PROJECT_DIR));
    s.dispatch(setFolders(args.folders));
    s.dispatch(setResources(args.resources));
    return s;
  });
  return (
    <Provider store={store}>
      <NarrativesView
        openInEditor={args.openInEditor}
        deps={{
          narratives: listDeps(args.subtypes, args.isPending),
          texts: TEXT_DEPS,
        }}
      />
    </Provider>
  );
}

const meta: Meta<StoryArgs> = {
  title: "Folklore/NarrativesView",
  render: (args: StoryArgs) => <Harness {...args} />,
  args: {
    folders: NARRATIVE_FOLDERS,
    resources: VARIANTS,
    subtypes: { n1: "Narrative" },
    openInEditor: fn(),
  },
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<StoryArgs>;

export const NarrativeWithVariants: Story = {
  play: async ({
    canvasElement,
    args,
  }: {
    canvasElement: HTMLElement;
    args: StoryArgs;
  }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByRole("list", { name: "Variants of Cinderella" }),
    ).toBeInTheDocument();
    expect(canvas.getByText(/not a Variant/)).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Open Telling B" }),
    );
    expect(args.openInEditor).toHaveBeenCalledWith("b");
  },
};

/** Tick two variants, press Compare (2), then Back to list: the ticks stay. */
export const ComparingTwoVariants: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("list", { name: "Variants of Cinderella" });
    const compare = canvas.getByRole("button", { name: "Compare (0)" });
    expect(compare).toBeDisabled();
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Select Telling A for comparison" }),
    );
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Select Telling B for comparison" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Compare (2)" }));
    expect(
      await canvas.findByRole("heading", {
        level: 3,
        name: "Comparing 2 variants",
      }),
    ).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "Back to list" }));
    expect(
      await canvas.findByRole("button", { name: "Compare (2)" }),
    ).toHaveFocus();
    expect(
      canvas.getByRole("checkbox", { name: "Select Telling A for comparison" }),
    ).toBeChecked();
  },
};

/** Four Variants, for checking that four columns fit the tab's width. */
export const FourVariants: Story = {
  args: {
    resources: [
      variant("a", 0),
      variant("b", 1),
      variant("c", 2),
      variant("d", 3),
    ],
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    expect(
      await within(canvasElement).findByRole("list", {
        name: "Variants of Cinderella",
      }),
    ).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: { isPending: true },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    expect(await within(canvasElement).findByRole("status")).toHaveTextContent(
      "Loading narratives",
    );
  },
};

export const NoNarrative: Story = {
  args: {
    folders: [folder("f", "Notes", 0)],
    resources: [],
    subtypes: { f: undefined },
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    expect(
      await within(canvasElement).findByText(/A narrative is a folder/),
    ).toBeInTheDocument();
  },
};

export const OtherSubtypesNamed: Story = {
  args: {
    folders: [folder("f", "Tales", 0)],
    resources: [],
    subtypes: { f: "Narratve" },
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    expect(
      await within(canvasElement).findByText(/other subtypes: Narratve/),
    ).toBeInTheDocument();
  },
};

export const FolderNotRead: Story = {
  args: {
    folders: [...NARRATIVE_FOLDERS, folder("bad", "Broken", 1)],
    subtypes: {
      n1: "Narrative",
      bad: new Error("The folder could not be read."),
    },
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText(/Broken: not read/)).toBeInTheDocument();
    expect(canvas.getByLabelText("Narrative")).toBeInTheDocument();
  },
};

export const Locked: Story = {
  args: {
    subtypes: { n1: new ProjectLockedError(PROJECT_DIR) as unknown as Error },
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    expect(
      await within(canvasElement).findByText(/project is locked/),
    ).toBeInTheDocument();
  },
};
