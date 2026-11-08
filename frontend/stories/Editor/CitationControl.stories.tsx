import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Provider } from "react-redux";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import CitationControlSlot from "../../components/Editor/Citations/CitationControlSlot";
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

const INTERVIEW = createSourceResource({
  name: "Interview with the archivist",
});
const LETTERS = createSourceResource({ name: "Letters, 1921" });
const CHAPTER = createTextResource({ name: "Chapter One" });

function CitationStory(): JSX.Element {
  const [{ store, editor }] = React.useState(() => {
    const created = makeStore();
    created.dispatch(
      setProject({ id: "story-p", rootPath: "/story/citation-control" }),
    );
    created.dispatch(setSelectedProjectId("story-p"));
    created.dispatch(setResources([INTERVIEW, LETTERS, CHAPTER]));
    const ed = new Editor({
      element: document.createElement("div"),
      extensions: baseSchemaExtensions,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Harbour lights at dusk." }],
          },
        ],
      },
    });
    ed.view.dispatch(
      ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1, 8)),
    );
    return { store: created, editor: ed };
  });
  React.useEffect(() => () => editor.destroy(), [editor]);
  return (
    <Provider store={store}>
      <div style={{ maxWidth: 720 }}>
        <CitationControlSlot editor={editor} resourceId={CHAPTER.id} />
      </div>
    </Provider>
  );
}

const meta: Meta<typeof CitationStory> = {
  title: "Editor/CitationControl",
  component: CitationStory,
  parameters: { a11y: { test: "error" } },
};

export default meta;
type Story = StoryObj<typeof CitationStory>;

/** The Sources module is on: the control lists the project's Sources. */
export const Default: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("group", { name: "Cite a Source" }),
    ).toBeInTheDocument();
    await userEvent.tab();
    await expect(canvas.getByLabelText("Source")).toHaveFocus();
  },
};

/** The Sources module is off: the control is not rendered. */
export const ModuleOff: Story = {
  parameters: { modules: { sources: false } },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("group", { name: "Cite a Source" }),
    ).toBeNull();
  },
};

/** Asking to cite with no Source chosen shows a text status and writes nothing. */
export const NoSourceChosen: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Cite selection" }),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Choose a Source to cite.",
    );
  },
};
