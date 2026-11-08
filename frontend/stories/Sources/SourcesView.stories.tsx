import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Provider } from "react-redux";
import SourcesView from "../../components/Sources/SourcesView";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setResources } from "../../src/store/resourcesSlice";
import {
  createSourceResource,
  createTextResource,
} from "../../src/lib/models/resource-factory";

const PROJECT_ROOT = "/story/sources-view-story-project";

type Scenario = "list" | "empty" | "read-fails" | "create-fails";

interface StoryArgs {
  scenario: Scenario;
}

const INTERVIEW = {
  ...createSourceResource({ name: "Interview with the archivist" }),
  resourceSubtype: "Primary",
};
const LETTERS = createSourceResource({ name: "Letters, 1921" });
const CHAPTER = createTextResource({ name: "Chapter One" });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function pdf(id: string) {
  return {
    id,
    fileName: `${id}.pdf`,
    originalName: `${id}.pdf`,
    mime: "application/pdf",
    size: 20480,
    addedAt: "2026-11-07T00:00:00.000Z",
  };
}

/** Replaces `fetch` for the attachments list only; restored on unmount. */
function useAttachmentsFetch(scenario: Scenario): void {
  const original = React.useRef<typeof fetch | null>(null);
  if (original.current === null) {
    original.current = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : String(input);
      if (scenario === "create-fails" && url.endsWith("/api/resource")) {
        return json({ error: "Nothing was added. Try again." }, 500);
      }
      if (!url.includes("/api/project/source-attachments")) {
        return original.current!(input, init);
      }
      if (scenario === "read-fails") {
        return json({ error: "The attachments could not be read." }, 500);
      }
      return url.includes(INTERVIEW.id)
        ? json([pdf("a1"), pdf("b2")])
        : json([]);
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
  useAttachmentsFetch(scenario);
  const store = React.useMemo(() => {
    const s = makeStore();
    s.dispatch(setProject({ id: "p", rootPath: PROJECT_ROOT }));
    s.dispatch(setSelectedProjectId("p"));
    s.dispatch(
      setResources(
        scenario === "empty" ? [CHAPTER] : [INTERVIEW, CHAPTER, LETTERS],
      ),
    );
    return s;
  }, [scenario]);
  return (
    <Provider store={store}>
      <SourcesView />
    </Provider>
  );
}

const meta: Meta<StoryArgs> = {
  title: "Sources/SourcesView",
  parameters: { a11y: { test: "error" } },
  args: { scenario: "list" },
  render: (args: StoryArgs) => <Harness key={args.scenario} {...args} />,
};
export default meta;

type Story = StoryObj<StoryArgs>;

export const List: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "Letters, 1921" });
    expect(canvas.queryByText("Chapter One")).toBeNull();
    await userEvent.tab();
  },
};

export const Empty: Story = {
  args: { scenario: "empty" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText("No Sources in this project."),
    ).toBeVisible();
    expect(canvas.queryByRole("alert")).toBeNull();
  },
};

export const ReadFails: Story = {
  args: { scenario: "read-fails" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByRole("alert")).toHaveTextContent(
      "could not be listed",
    );
    expect(canvas.queryByText("No Sources in this project.")).toBeNull();
  },
};

export const CreateOpen: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "Letters, 1921" });
    await userEvent.click(canvas.getByRole("button", { name: "New Source" }));
    expect(canvas.getByLabelText("Source name")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(canvas.queryByLabelText("Source name")).toBeNull();
  },
};

export const CreateFails: Story = {
  args: { scenario: "create-fails" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "Letters, 1921" });
    await userEvent.click(canvas.getByRole("button", { name: "New Source" }));
    await userEvent.keyboard("Field notes{Enter}");
    expect(await canvas.findByRole("alert")).toBeVisible();
    expect(canvas.queryByRole("button", { name: "Field notes" })).toBeNull();
  },
};

export const RenameOpen: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Rename Letters, 1921" }),
    );
    expect(canvas.getByLabelText("New name for Letters, 1921")).toHaveFocus();
  },
};
