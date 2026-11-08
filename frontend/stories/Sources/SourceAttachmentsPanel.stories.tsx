import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Provider } from "react-redux";
import SourcesView from "../../components/Sources/SourcesView";
import MetadataSidebar from "../../components/Sidebar/MetadataSidebar";
import { uiModuleRegistry } from "../../components/Modules/uiRegistry";
import TrashRefreshProvider from "../../components/Layout/TrashRefreshContext";
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

const PROJECT_ROOT = "/story/source-attachments-panel-story-project";
const SOURCE = createSourceResource({ name: "Interview with the archivist" });

type FetchMode = "ok" | "read-fails";

interface StoryArgs {
  fetchMode: FetchMode;
}

function entry(id: string, originalName: string) {
  return {
    id,
    fileName: `${id}.png`,
    originalName,
    mime: "image/png",
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
    let stored = [entry("a1", "portrait.png"), entry("b2", "map.png")];
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
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        attachmentId?: string;
      };
      if (method === "DELETE") {
        stored = stored.filter((e) => e.id !== body.attachmentId);
        return json({ trashId: "trash-1" });
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

function Harness({ fetchMode }: StoryArgs): JSX.Element {
  useAttachmentsFetch(fetchMode);
  const store = React.useMemo(() => {
    const s = makeStore();
    s.dispatch(setProject({ id: "p", rootPath: PROJECT_ROOT }));
    s.dispatch(setSelectedProjectId("p"));
    s.dispatch(setResources([SOURCE]));
    s.dispatch(setSelectedResourceId(SOURCE.id));
    return s;
  }, []);
  const slot = uiModuleRegistry.getAttachmentsSection("sources");
  return (
    <Provider store={store}>
      <TrashRefreshProvider>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <SourcesView
              renderAttachments={(resource) => slot?.render({ resource })}
            />
          </div>
          <div style={{ width: 320 }}>
            <MetadataSidebar />
          </div>
        </div>
      </TrashRefreshProvider>
    </Provider>
  );
}

const meta: Meta<StoryArgs> = {
  title: "Sources/SourceAttachmentsPanel",
  parameters: { a11y: { test: "error" } },
  args: { fetchMode: "ok" },
  render: (args: StoryArgs) => <Harness key={args.fetchMode} {...args} />,
};
export default meta;

type Story = StoryObj<StoryArgs>;

/** The Sources view's attachments section, opened for one Source. */
export const InSourcesView: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Show attachments of Interview with the archivist",
      }),
    );
    expect(await canvas.findAllByText("portrait.png")).toHaveLength(2);
  },
};

/** A removal made in the view shows in the sidebar's section at once. */
export const RemoveShowsInSidebar: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Show attachments of Interview with the archivist",
      }),
    );
    const removeButtons = await canvas.findAllByRole("button", {
      name: "Remove map.png",
    });
    await userEvent.click(removeButtons[0]);
    await canvas.findAllByText(/Restore it from the Trash/);
    expect(canvas.queryByText("map.png")).toBeNull();
  },
};

/** A failed read shows an error and Retry in the panel, not an empty list. */
export const ReadFails: Story = {
  args: { fetchMode: "read-fails" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect((await canvas.findAllByRole("alert"))[0]).toBeInTheDocument();
  },
};
