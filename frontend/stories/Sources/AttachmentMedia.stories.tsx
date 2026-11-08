import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Provider } from "react-redux";
import SourceAttachmentsPanel from "../../components/Sources/SourceAttachmentsPanel";
import TrashRefreshProvider from "../../components/Layout/TrashRefreshContext";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { createSourceResource } from "../../src/lib/models/resource-factory";

const SOURCE = createSourceResource({ name: "Interview with the archivist" });

type BytesMode = "ok" | "read-fails" | "locked";

interface StoryArgs {
  bytesMode: BytesMode;
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

const ENTRIES = [
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Replaces `fetch` for the attachment routes only; restored on unmount. */
function useAttachmentsFetch(mode: BytesMode): void {
  const original = React.useRef<typeof fetch | null>(null);
  if (original.current === null) {
    original.current = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes("/api/project/source-attachments/bytes")) {
        if (mode === "locked") return json({ error: "Locked." }, 401);
        if (mode === "read-fails") {
          return json({ error: "The attachment could not be read." }, 500);
        }
        const isImage = url.includes("attachmentId=a1");
        return new Response(
          new Blob([(isImage ? PNG_BYTES : wavBytes()) as BlobPart]),
          {
            status: 200,
            headers: {
              "Content-Type": isImage ? "image/png" : "audio/wav",
              "x-attachment-kind": isImage ? "image" : "audio",
            },
          },
        );
      }
      if (url.includes("/api/project/source-attachments")) {
        return json(ENTRIES);
      }
      return original.current!(input, init);
    };
  }
  React.useEffect(
    () => () => {
      if (original.current) globalThis.fetch = original.current;
    },
    [],
  );
}

function Harness({ bytesMode }: StoryArgs): JSX.Element {
  useAttachmentsFetch(bytesMode);
  const store = React.useMemo(() => {
    const s = makeStore();
    s.dispatch(setProject({ id: "p", rootPath: "/story/attachment-media" }));
    s.dispatch(setSelectedProjectId("p"));
    return s;
  }, []);
  return (
    <Provider store={store}>
      <TrashRefreshProvider>
        <div style={{ width: 360 }}>
          <SourceAttachmentsPanel resource={SOURCE} />
        </div>
      </TrashRefreshProvider>
    </Provider>
  );
}

const meta: Meta<StoryArgs> = {
  title: "Sources/AttachmentMedia",
  parameters: { a11y: { test: "error" } },
  args: { bytesMode: "ok" },
  render: (args: StoryArgs) => <Harness key={args.bytesMode} {...args} />,
};
export default meta;

type Story = StoryObj<StoryArgs>;

/** Preview reads the bytes on request and shows the image. */
export const ImagePreview: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Preview portrait.png" }),
    );
    expect(
      await canvas.findByRole("img", { name: "portrait.png" }),
    ).toBeVisible();
  },
};

/** Preview shows native audio controls. */
export const AudioPlayback: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Preview interview.wav" }),
    );
    const audio = await waitForAudio(canvasElement);
    expect(audio).toHaveAttribute("controls");
  },
};

/** A failed byte read is an alert, not an empty attachment. */
export const ReadFails: Story = {
  args: { bytesMode: "read-fails" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Preview portrait.png" }),
    );
    expect(await canvas.findByRole("alert")).toHaveTextContent(
      "could not be read",
    );
  },
};

/** A locked project reads as locked. */
export const Locked: Story = {
  args: { bytesMode: "locked" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Preview portrait.png" }),
    );
    expect(await canvas.findByRole("alert")).toHaveTextContent(/locked/i);
  },
};

async function waitForAudio(root: HTMLElement): Promise<HTMLAudioElement> {
  for (let i = 0; i < 50; i += 1) {
    const found = root.querySelector("audio");
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("The audio element did not appear.");
}
