import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Provider } from "react-redux";
import SourcesView from "../../components/Sources/SourcesView";
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

// Target of `e2e/sources-view-attachments.spec.ts` (Feature 103, Task 22,
// FR-17). One stateful mock stands in for the attachment routes, so an add
// and a remove made through the UI are visible to the next read.

const PROJECT_ROOT = "/story/sources-view-attachments-flow-project";
const SOURCE = createSourceResource({ name: "Interview with the archivist" });

/**
 * ok: every route answers. list-locked: every attachment route answers as a
 * locked project. bytes-locked: the list answers, the byte read is locked.
 */
type FlowMode = "ok" | "list-locked" | "bytes-locked";

interface StoryArgs {
  flowMode: FlowMode;
}

/** A 1x1 transparent PNG. */
const PNG_BYTES = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

/** A short silent 8-bit mono WAV (800 samples at 8000 Hz). */
function wavBytes(): Uint8Array {
  const samples = 800;
  const out = new Uint8Array(44 + samples);
  const view = new DataView(out.buffer);
  const text = (at: number, value: string): void =>
    value.split("").forEach((c, i) => out.set([c.charCodeAt(0)], at + i));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, samples, true);
  out.fill(128, 44);
  return out;
}

interface StoredEntry {
  id: string;
  fileName: string;
  originalName: string;
  mime: string;
  size: number;
  addedAt: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Replaces `fetch` for the attachment routes only; restored on unmount. */
function useAttachmentsFetch(mode: FlowMode): void {
  const original = React.useRef<typeof fetch | null>(null);
  if (original.current === null) {
    original.current = globalThis.fetch;
    let nextId = 1;
    let stored: StoredEntry[] = [
      {
        id: "a1",
        fileName: "a1.png",
        originalName: "portrait.png",
        mime: "image/png",
        size: PNG_BYTES.byteLength,
        addedAt: "2026-11-07T00:00:00.000Z",
      },
      {
        id: "b2",
        fileName: "b2.wav",
        originalName: "interview.wav",
        mime: "audio/wav",
        size: 844,
        addedAt: "2026-11-07T00:00:00.000Z",
      },
    ];
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : String(input);
      if (!url.includes("/api/project/source-attachments")) {
        return original.current!(input, init);
      }
      if (mode === "list-locked") return json({ error: "Locked." }, 401);
      if (url.includes("/api/project/source-attachments/bytes")) {
        if (mode === "bytes-locked") return json({ error: "Locked." }, 401);
        const isAudio = url.includes("attachmentId=b2");
        return new Response(
          new Blob([(isAudio ? wavBytes() : PNG_BYTES) as BlobPart]),
          {
            status: 200,
            headers: {
              "Content-Type": isAudio ? "audio/wav" : "image/png",
              "x-attachment-kind": isAudio ? "audio" : "image",
            },
          },
        );
      }
      const method = init?.method ?? "GET";
      if (method === "GET") return json(stored);
      if (method === "POST") {
        const file = (init?.body as FormData).get("file") as File;
        const added: StoredEntry = {
          id: `added-${nextId}`,
          fileName: `added-${nextId}.png`,
          originalName: file.name,
          mime: "image/png",
          size: file.size,
          addedAt: "2026-11-07T00:00:00.000Z",
        };
        nextId += 1;
        stored = [...stored, added];
        return json(added);
      }
      if (method === "DELETE") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          attachmentId?: string;
        };
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

function Harness({ flowMode }: StoryArgs): JSX.Element {
  useAttachmentsFetch(flowMode);
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
        <div style={{ width: 640 }}>
          <SourcesView
            renderAttachments={(resource) => slot?.render({ resource })}
          />
        </div>
      </TrashRefreshProvider>
    </Provider>
  );
}

const meta: Meta<StoryArgs> = {
  title: "Sources/SourcesViewAttachmentsFlow",
  parameters: { a11y: { test: "error" } },
  args: { flowMode: "ok" },
  render: (args: StoryArgs) => <Harness key={args.flowMode} {...args} />,
};
export default meta;

type Story = StoryObj<StoryArgs>;

/** The Sources view with one Source and two attachments; the e2e drives it. */
export const Flow: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Show attachments of Interview with the archivist",
      }),
    );
    expect(await canvas.findByText("portrait.png")).toBeInTheDocument();
  },
};

/** A locked project: the view says so, with no list shown as empty. */
export const ProjectLocked: Story = {
  args: { flowMode: "list-locked" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByRole("alert")).toHaveTextContent(/locked/i);
  },
};

/** The list reads, the byte read is locked: Preview shows a locked alert. */
export const PreviewLocked: Story = {
  args: { flowMode: "bytes-locked" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Show attachments of Interview with the archivist",
      }),
    );
    await userEvent.click(
      await canvas.findByRole("button", { name: "Preview portrait.png" }),
    );
    expect(await canvas.findByRole("alert")).toHaveTextContent(/locked/i);
  },
};
