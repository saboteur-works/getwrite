import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Provider } from "react-redux";
import TrashRefreshProvider from "../../components/Layout/TrashRefreshContext";
import MetadataSidebar from "../../components/Sidebar/MetadataSidebar";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import {
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import { createSourceResource } from "../../src/lib/models/resource-factory";

const PROJECT_ID = "source-attachments-story-project";
const SOURCE = createSourceResource({ name: "Interview with the archivist" });

type FetchMode = "ok" | "read-fails" | "add-refused";

interface StoryArgs {
  fetchMode: FetchMode;
}

function entry(id: string, originalName: string) {
  return {
    id,
    fileName: `${id}.pdf`,
    originalName,
    mime: "application/pdf",
    size: 20480,
    addedAt: "2026-11-07T00:00:00.000Z",
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Replaces `fetch` for the attachments route only; restored on unmount. */
function useAttachmentsFetch(mode: FetchMode): void {
  const original = React.useRef<typeof fetch | null>(null);
  if (original.current === null) {
    original.current = globalThis.fetch;
    let stored = [
      entry("a1", "transcript.pdf"),
      entry("b2", "scan-page-1.png"),
      entry("c3", "notes.pdf"),
    ];
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : String(input);
      if (!url.includes("/api/project/source-attachments")) {
        return original.current!(input, init);
      }
      const method = init?.method ?? "GET";
      if (method === "GET") {
        return mode === "read-fails"
          ? json({ error: "The attachments could not be read." }, 500)
          : json(stored);
      }
      if (method === "POST") {
        if (mode === "add-refused") {
          return json(
            { error: "A Source holds at most 500 attachments." },
            400,
          );
        }
        // Keep the added entry so a later reorder or remove sees it.
        const added = entry("d4", "added.pdf");
        stored = [...stored, added];
        return json(added);
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        attachmentId?: string;
        orderedIds?: string[];
      };
      if (method === "DELETE") {
        stored = stored.filter((e) => e.id !== body.attachmentId);
        return json({ trashId: "trash-1" });
      }
      if (method === "PATCH" && body.orderedIds) {
        stored = body.orderedIds.map(
          (id) => stored.find((e) => e.id === id) ?? stored[0],
        );
        return json(stored);
      }
      return json({ error: "Not handled by this story." }, 400);
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
      name: "Source Attachments Story",
      rootPath: `/tmp/${PROJECT_ID}`,
    } as Parameters<typeof setProject>[0]),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  store.dispatch(setResources([SOURCE]));
  store.dispatch(setSelectedResourceId(SOURCE.id));
  return store;
}

function Harness({ fetchMode }: StoryArgs): JSX.Element {
  useAttachmentsFetch(fetchMode);
  const store = React.useMemo(buildStore, []);
  return (
    <Provider store={store}>
      <TrashRefreshProvider>
        <div style={{ width: 320, height: 640 }}>
          <MetadataSidebar />
        </div>
      </TrashRefreshProvider>
    </Provider>
  );
}

const meta: Meta<StoryArgs> = {
  title: "Sidebar/SourceAttachmentsSection",
  parameters: { a11y: { test: "error" } },
  args: { fetchMode: "ok" },
  render: (args: StoryArgs) => <Harness {...args} />,
};

export default meta;

type Story = StoryObj<StoryArgs>;

/** A Source selected in the metadata sidebar: its attachments in order. */
export const AttachmentList: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText("transcript.pdf")).toBeInTheDocument();
    const items = canvas.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("transcript.pdf");
    expect(items[2]).toHaveTextContent("notes.pdf");
    expect(
      canvas.getByRole("button", { name: "Add attachment" }),
    ).toBeVisible();
  },
};

/** Moving an attachment down reorders the list from the server's answer. */
export const Reorder: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Move transcript.pdf down" }),
    );
    await within(canvasElement).findByText(/Moved transcript\.pdf/);
    expect(canvas.getAllByRole("listitem")[1]).toHaveTextContent(
      "transcript.pdf",
    );
  },
};

/** Removing an attachment drops it from the list and points to Trash. */
export const Remove: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Remove notes.pdf" }),
    );
    expect(await canvas.findByText(/Restore it from the Trash/)).toBeVisible();
    expect(canvas.queryByText("notes.pdf")).toBeNull();
  },
};

/** A refused add shows the message and leaves the list as it was. */
export const AddRefused: Story = {
  args: { fetchMode: "add-refused" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("transcript.pdf");
    await userEvent.upload(
      canvas.getByLabelText("Add attachment file"),
      new File(["x"], "extra.pdf", { type: "application/pdf" }),
    );
    expect(await canvas.findByRole("alert")).toHaveTextContent("at most 500");
    expect(canvas.getAllByRole("listitem")).toHaveLength(3);
  },
};

/** A failed read shows an error and Retry, not an empty list. */
export const ReadFails: Story = {
  args: { fetchMode: "read-fails" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByRole("alert")).toHaveTextContent("couldn't load");
    expect(canvas.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  },
};
