import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Provider } from "react-redux";
import ExcerptsSection from "../../components/Sources/ExcerptsSection";
import TrashRefreshProvider from "../../components/Layout/TrashRefreshContext";
import { PERMANENT_DELETION_LIMITED_REASON } from "../../components/Sharing/sharing-copy";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setResources } from "../../src/store/resourcesSlice";
import { createSourceResource } from "../../src/lib/models/resource-factory";

// Context: the global Storybook decorators supply the sharing-limits provider
// (`parameters.sharingLimits`), the modules provider and the store; this story
// adds the project store with a Source and the Trash refresh context that the
// attachments reader needs, and replaces `fetch` for the annotation and
// attachment routes only.

const PROJECT_ROOT = "/story/excerpts-section-project";
const SOURCE = createSourceResource({ name: "Interview with the archivist" });
const IMAGE_ID = "11111111-1111-4111-8111-111111111111";

type Scenario = "listed" | "empty" | "read-fails";

interface StoryArgs {
  scenario: Scenario;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const EXCERPTS = [
  {
    id: "e1",
    body: "The greeting.",
    quote: "Good morning",
    createdAt: "2026-11-07T00:00:00.000Z",
    updatedAt: "2026-11-07T00:00:00.000Z",
    target: { sourceId: SOURCE.id, locator: { type: "page", value: "12" } },
  },
  {
    id: "e2",
    body: "",
    quote: "",
    createdAt: "2026-11-07T00:00:00.000Z",
    updatedAt: "2026-11-07T00:00:00.000Z",
    target: {
      sourceId: SOURCE.id,
      attachmentId: IMAGE_ID,
      locator: { type: "timestamp", value: "01:02" },
    },
  },
];

/** Replaces `fetch` for the annotation and attachment reads; restored on unmount. */
function useRoutesFetch(scenario: Scenario): void {
  const original = React.useRef<typeof fetch | null>(null);
  if (original.current === null) {
    original.current = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes("/api/annotations")) {
        if (scenario === "read-fails") {
          return json({ error: "The annotations could not be read." }, 500);
        }
        return json({ annotations: scenario === "empty" ? [] : EXCERPTS });
      }
      if (url.includes("/api/project/source-attachments")) {
        return json([
          {
            id: IMAGE_ID,
            fileName: `${IMAGE_ID}.png`,
            originalName: "scan.png",
            mime: "image/png",
            size: 2048,
            addedAt: "2026-11-07T00:00:00.000Z",
          },
        ]);
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

function Harness({ scenario }: StoryArgs): JSX.Element {
  useRoutesFetch(scenario);
  const store = React.useMemo(() => {
    const s = makeStore();
    s.dispatch(setProject({ id: "p", rootPath: PROJECT_ROOT }));
    s.dispatch(setSelectedProjectId("p"));
    s.dispatch(setResources([SOURCE]));
    return s;
  }, []);
  return (
    <Provider store={store}>
      <TrashRefreshProvider>
        <ExcerptsSection resource={SOURCE} />
      </TrashRefreshProvider>
    </Provider>
  );
}

const meta: Meta<StoryArgs> = {
  title: "Sources/ExcerptsSection",
  parameters: { a11y: { test: "error" } },
  args: { scenario: "listed" },
  render: (args: StoryArgs) => <Harness key={args.scenario} {...args} />,
};
export default meta;

type Story = StoryObj<StoryArgs>;

export const Listed: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const list = await canvas.findByRole("list", { name: "Excerpts" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("Page 12")).toBeVisible();
    await userEvent.tab();
  },
};

export const Empty: Story = {
  args: { scenario: "empty" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText("No excerpts yet.")).toBeVisible();
    expect(canvas.queryByRole("alert")).toBeNull();
  },
};

export const ReadFails: Story = {
  args: { scenario: "read-fails" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByRole("alert")).toHaveTextContent("Error:");
    expect(canvas.queryByText("No excerpts yet.")).toBeNull();
  },
};

/** The view has no mark control: it points to the editor's Mark as excerpt. */
export const PointsToEditorControl: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("list", { name: "Excerpts" });
    expect(
      canvas.queryByRole("button", { name: "Mark selected text as excerpt" }),
    ).toBeNull();
    expect(
      canvas.getByText(/open this Source in the editor, select the text/),
    ).toBeVisible();
  },
};

export const DeleteLimitedOnPairedDevice: Story = {
  parameters: {
    sharingLimits: {
      state: {
        state: "paired",
        limits: {
          projectDeletion: false,
          unlocking: false,
          locking: false,
          encryptionChanges: false,
          permanentDeletion: true,
        },
      },
    },
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole("button", {
      name: "Delete excerpt Good morning",
    });
    expect(button).toBeDisabled();
    expect(canvas.getByText(PERMANENT_DELETION_LIMITED_REASON)).toBeVisible();
  },
};
