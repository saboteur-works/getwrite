import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ProjectTypesManagerPage from "../../components/project-types/ProjectTypesManagerPage";
import { Dialog } from "../../components/common/UI/Dialog/Dialog";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type {
  ProjectTypeDefinition,
  ProjectTypeTemplateFile,
} from "../../src/types/project-types";
import type {
  ProjectTypesTransport,
  ProjectTypeWriteOutcome,
} from "../../src/lib/api/project-types";

const initialTemplates: ProjectTypeTemplateFile[] = [
  {
    fileName: "novel.json",
    definition: {
      id: "novel",
      name: "Novel",
      description: "Long-form fiction project type",
      folders: [
        { name: "Workspace", special: true },
        { name: "Characters", special: true },
      ],
    },
  },
  {
    fileName: "short-story.json",
    definition: {
      id: "short-story",
      name: "Short Story",
      description: "Compact story drafting",
      folders: [{ name: "Workspace", special: true }],
    },
  },
];

const meta: Meta<typeof ProjectTypesManagerPage> = {
  title: "ProjectTypes/ProjectTypesManagerPage",
  component: ProjectTypesManagerPage,
  decorators: [
    (Story: React.ComponentType) => (
      <Dialog open onOpenChange={() => undefined}>
        <Story />
      </Dialog>
    ),
  ],
  parameters: { layout: "fullscreen" },
};

export default meta;

type Story = StoryObj<typeof ProjectTypesManagerPage>;

export const ModalMode: Story = {
  args: {
    initialTemplates,
    renderInModal: true,
    onClose: () => console.log("close"),
  },
};

const savedTemplate: ProjectTypeTemplateFile = {
  fileName: "my-novel.json",
  source: "saved",
  definition: {
    id: "my-novel",
    name: "My Novel",
    description: "A saved type",
    folders: [{ name: "Workspace" }],
  },
};

const builtInTemplates: ProjectTypeTemplateFile[] = initialTemplates.map(
  (template) => ({ ...template, source: "built-in" }),
);

/** In-memory transport so stories never touch the network or any folder. */
function fakeTransport(
  outcome: (spec: ProjectTypeDefinition) => ProjectTypeWriteOutcome,
): () => Promise<ProjectTypesTransport> {
  const transport: ProjectTypesTransport = {
    list: async () => ({
      entries: [...builtInTemplates, savedTemplate].map((t) => ({
        spec: t.definition,
        fileName: t.fileName,
        source: t.source ?? "built-in",
      })),
      unusable: [],
      savedStatus: "ok",
    }),
    create: async (spec) => outcome(spec),
    update: async (_id, spec) => outcome(spec),
    remove: async () => ({ ok: true, fileName: "my-novel.json" }),
  };
  return async () => transport;
}

async function startDraftAndSave(
  canvasElement: HTMLElement,
  id: string,
  name: string,
): Promise<void> {
  const canvas = within(canvasElement);
  await userEvent.click(
    await canvas.findByRole("button", { name: "New Project Type" }),
  );
  await userEvent.type(canvas.getByLabelText("ID"), id);
  await userEvent.type(canvas.getByLabelText("Name"), name);
  await userEvent.click(canvas.getByRole("button", { name: "Save" }));
}

export const BuiltIn: Story = {
  args: {
    initialTemplates: builtInTemplates,
    renderInModal: true,
    resolveTransport: fakeTransport((spec) => ({
      ok: true,
      fileName: `${spec.id}.json`,
      spec,
    })),
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const bar = within(
      within(canvasElement).getByRole("group", {
        name: "Project type actions",
      }),
    );
    await expect(bar.getByText("Built-in")).toBeInTheDocument();
    await expect(
      bar.getByRole("button", { name: "Save as copy" }),
    ).toBeInTheDocument();
    await expect(bar.queryByRole("button", { name: "Delete" })).toBeNull();
  },
};

export const Saved: Story = {
  args: {
    initialTemplates: [savedTemplate, ...builtInTemplates],
    renderInModal: true,
    resolveTransport: fakeTransport((spec) => ({
      ok: true,
      fileName: `${spec.id}.json`,
      spec,
    })),
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const bar = within(
      within(canvasElement).getByRole("group", {
        name: "Project type actions",
      }),
    );
    await expect(bar.getByText("Saved")).toBeInTheDocument();
    await expect(bar.getByRole("button", { name: "Delete" })).toBeEnabled();
  },
};

export const Draft: Story = {
  args: {
    initialTemplates: builtInTemplates,
    renderInModal: true,
    resolveTransport: fakeTransport((spec) => ({
      ok: true,
      fileName: `${spec.id}.json`,
      spec,
    })),
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await startDraftAndSave(canvasElement, "fresh", "Fresh");
    await waitFor(() =>
      expect(within(canvasElement).getByRole("status")).toHaveTextContent(
        /Saved/,
      ),
    );
  },
};

export const Refusal: Story = {
  args: {
    initialTemplates: builtInTemplates,
    renderInModal: true,
    resolveTransport: fakeTransport(() => ({
      ok: false,
      reason: "id-clash",
      message: "Novel (built-in) already uses this id.",
    })),
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await startDraftAndSave(canvasElement, "novel", "Another");
    await expect(
      await within(canvasElement).findByRole("alert"),
    ).toHaveTextContent("Novel (built-in) already uses this id.");
  },
};

export const SavingUnavailable: Story = {
  args: {
    initialTemplates: builtInTemplates,
    renderInModal: true,
    resolveTransport: fakeTransport(() => ({
      ok: false,
      reason: "saving-unavailable",
      message: "Saving project types is not available here.",
    })),
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await startDraftAndSave(canvasElement, "fresh", "Fresh");
    await expect(
      await within(canvasElement).findByRole("alert"),
    ).toHaveTextContent("not available");
  },
};

export const WithNotice: Story = {
  args: {
    initialTemplates: [savedTemplate, ...builtInTemplates],
    renderInModal: true,
    listNotice: "2 saved project type files could not be used.",
  },
};

export const UnsavedChangesPromptOnSelect: Story = {
  args: {
    initialTemplates: [savedTemplate, ...builtInTemplates],
    renderInModal: true,
    resolveTransport: fakeTransport((spec) => ({
      ok: true,
      fileName: `${spec.id}.json`,
      spec,
    })),
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(await canvas.findByLabelText("Name"));
    await userEvent.type(canvas.getByLabelText("Name"), "My Novel 2");
    await userEvent.click(canvas.getByRole("button", { name: /Short Story/ }));
    const dialog = await within(document.body).findByRole("dialog", {
      name: "Unsaved changes",
    });
    await expect(
      within(dialog).getByRole("button", { name: "Keep editing" }),
    ).toBeInTheDocument();
  },
};

export const EscapeOnPromptKeepsEditing: Story = {
  args: {
    initialTemplates: [savedTemplate, ...builtInTemplates],
    renderInModal: true,
    resolveTransport: fakeTransport((spec) => ({
      ok: true,
      fileName: `${spec.id}.json`,
      spec,
    })),
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(await canvas.findByLabelText("Name"));
    await userEvent.type(canvas.getByLabelText("Name"), "My Novel 2");
    await userEvent.click(canvas.getByRole("button", { name: /Short Story/ }));
    await within(document.body).findByRole("dialog", {
      name: "Unsaved changes",
    });
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        within(document.body).queryByRole("dialog", {
          name: "Unsaved changes",
        }),
      ).toBeNull(),
    );
    await expect(canvas.getByLabelText("Name")).toHaveValue("My Novel 2");
  },
};
