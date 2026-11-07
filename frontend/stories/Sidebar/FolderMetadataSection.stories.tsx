import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { Provider } from "react-redux";
import MetadataSidebar from "../../components/Sidebar/MetadataSidebar";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import {
  setFolders,
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import type { Folder } from "../../src/lib/models/types";

const PROJECT_ID = "folder-metadata-story-project";
const FOLDER = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "folder",
  name: "Characters",
  slug: "characters",
} as Folder;

type FetchMode = "ok" | "read-fails" | "save-fails";

interface StoryArgs {
  fetchMode: FetchMode;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Replaces `fetch` for the folder-metadata route only; restored on unmount. */
function useFolderMetadataFetch(mode: FetchMode): void {
  const original = React.useRef<typeof fetch | null>(null);
  if (original.current === null) {
    original.current = globalThis.fetch;
    let stored: {
      notes: string;
      fieldValues: Record<string, unknown>;
      resourceSubtype?: string;
    } = {
      notes: "Principal cast.",
      fieldValues: { mood: "tense" },
      resourceSubtype: "Cast",
    };
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : String(input);
      if (!url.includes("/api/project/folder-metadata")) {
        return original.current!(input, init);
      }
      if (init?.method === "PUT") {
        if (mode === "save-fails") {
          return json({ error: "The disk is full." }, 500);
        }
        // Merge the write so a later read (and the saved response) reflects it.
        const sent = JSON.parse(String(init.body ?? "{}")) as {
          metadata?: Partial<typeof stored>;
        };
        stored = {
          ...stored,
          ...sent.metadata,
          fieldValues: {
            ...stored.fieldValues,
            ...(sent.metadata?.fieldValues ?? {}),
          },
        };
        return json(stored);
      }
      return mode === "read-fails"
        ? json({ error: "The folder could not be read." }, 500)
        : json(stored);
    };
  }
  React.useEffect(
    () => () => {
      if (original.current) globalThis.fetch = original.current;
    },
    [],
  );
}

function buildStore() {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Folder Metadata Story",
      rootPath: `/tmp/${PROJECT_ID}`,
      subtypes: ["Cast", "Place"],
      metadataSchema: {
        groups: [
          {
            id: "g",
            label: "Details",
            fields: [{ key: "mood", label: "Mood", type: "text" }],
          },
        ],
      },
    } as Parameters<typeof setProject>[0]),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  store.dispatch(setResources([]));
  store.dispatch(setFolders([FOLDER]));
  store.dispatch(setSelectedResourceId(FOLDER.id));
  return store;
}

function Harness({ fetchMode }: StoryArgs): JSX.Element {
  useFolderMetadataFetch(fetchMode);
  const store = React.useMemo(buildStore, []);
  return (
    <Provider store={store}>
      <div style={{ width: 320, height: 520 }}>
        <MetadataSidebar />
      </div>
    </Provider>
  );
}

const meta: Meta<StoryArgs> = {
  title: "Sidebar/FolderMetadataSection",
  parameters: { a11y: { test: "error" } },
  args: { fetchMode: "ok" },
  render: (args: StoryArgs) => <Harness {...args} />,
};

export default meta;

type Story = StoryObj<StoryArgs>;

/** A folder selected in the metadata sidebar: notes, subtype and a field. */
export const FolderView: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByLabelText("Folder notes")).toHaveValue(
      "Principal cast.",
    );
    expect(canvas.getByRole("combobox", { name: "Subtype" })).toHaveValue(
      "Cast",
    );
  },
};

/** A failed read shows an error and Retry, not an empty folder. */
export const ReadFails: Story = {
  args: { fetchMode: "read-fails" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByRole("alert")).toHaveTextContent("couldn't load");
    expect(canvas.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  },
};
