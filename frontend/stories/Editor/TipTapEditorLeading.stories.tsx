import React from "react";
import { useDispatch } from "react-redux";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import TipTapEditor from "../../components/TipTapEditor";
import { setEditorConfig } from "../../src/store/editorConfigSlice";
import type { TipTapDocument } from "../../src/lib/models";

const meta: Meta<typeof TipTapEditor> = {
  title: "Editor/TipTapEditor/Paragraph leading",
  component: TipTapEditor,
  parameters: {
    docs: {
      description: {
        component:
          "Paragraph leading against the project body line height. An unset " +
          "paragraph follows the project setting (Body Text Styles), a " +
          "paragraph with explicit leading keeps its own value, and a value " +
          "set through the toolbar is stored as a JSON number and survives a " +
          "remount from the stored document. In-memory data only.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof TipTapEditor>;

const SEED_DOCUMENT = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Untouched one" }] },
    {
      type: "paragraph",
      attrs: { paragraphLeading: 1.2 },
      content: [{ type: "text", text: "Explicit two" }],
    },
    { type: "paragraph", content: [{ type: "text", text: "Untouched three" }] },
  ],
} as unknown as TipTapDocument;

type ProjectLineHeight = "2.2" | "2.4" | "absent";

/**
 * Editor mounted from a stored document, with controls to change the project
 * line height and to close and reopen the editor (remount from the last
 * document the editor emitted), which is shown verbatim in `stored-doc`.
 */
function LeadingHarness(): JSX.Element {
  const dispatch = useDispatch();
  const [stored, setStored] = React.useState<TipTapDocument>(SEED_DOCUMENT);
  const [mountKey, setMountKey] = React.useState<number>(0);
  const [isReady, setReady] = React.useState<boolean>(false);

  const applyLineHeight = React.useCallback(
    (lineHeight: ProjectLineHeight) => {
      dispatch(
        setEditorConfig({
          headings: {},
          body: lineHeight === "absent" ? undefined : { lineHeight },
        }),
      );
    },
    [dispatch],
  );

  React.useEffect(() => {
    applyLineHeight("2.2");
    setReady(true);
  }, [applyLineHeight]);

  if (!isReady) return <div data-testid="seeding">Seeding&hellip;</div>;
  return (
    <div>
      <div role="group" aria-label="Project line height">
        {(["2.2", "2.4", "absent"] as const).map((option) => (
          <button
            key={option}
            type="button"
            data-testid={`project-line-height-${option}`}
            onClick={() => applyLineHeight(option)}
          >
            {`Project ${option}`}
          </button>
        ))}
        <button
          type="button"
          data-testid="reopen-editor"
          onClick={() => setMountKey((key) => key + 1)}
        >
          Close and reopen
        </button>
      </div>
      <TipTapEditor
        key={mountKey}
        id="leading-editor"
        value={stored}
        onChange={(_html, doc) => setStored(doc)}
      />
      <pre data-testid="stored-doc">{JSON.stringify(stored)}</pre>
    </div>
  );
}

export const ProjectLineHeightAndExplicitLeading: Story = {
  render: () => <LeadingHarness />,
};
