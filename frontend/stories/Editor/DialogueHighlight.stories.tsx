import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import TipTapEditor from "../../components/TipTapEditor";
import {
  setDialogueHighlightSettings,
  useDialogueHighlightSettings,
} from "../../components/Editor/dialogue-highlight-store";
import type { TipTapDocument } from "../../src/lib/models";

const meta: Meta<typeof TipTapEditor> = {
  title: "Editor/TipTapEditor/Dialogue highlight",
  component: TipTapEditor,
  parameters: {
    docs: {
      description: {
        component:
          "The dialogue highlight switched on from Prose Diagnostics: quoted " +
          "speech is tinted, by double or single quotes. View-only and " +
          "session-only. In-memory data only.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof TipTapEditor>;

const DOCUMENT = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "“Go home,” she said. He didn’t move. ‘I don’t know,’ he answered at last.",
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "The dogs’ bowl sat empty. \"Fine,\" she said, 'have it your way.'",
        },
      ],
    },
  ],
} as unknown as TipTapDocument;

/** The editor with the same switch and quote choice the sidebar offers. */
function DialogueHarness({
  initialQuoteStyle,
}: {
  initialQuoteStyle: "double" | "single";
}): JSX.Element {
  const [isSeeded, setIsSeeded] = React.useState(false);
  React.useEffect(() => {
    setDialogueHighlightSettings({
      isEnabled: true,
      quoteStyle: initialQuoteStyle,
    });
    setIsSeeded(true);
    return () =>
      setDialogueHighlightSettings({ isEnabled: false, quoteStyle: "double" });
  }, [initialQuoteStyle]);
  const settings = useDialogueHighlightSettings();
  if (!isSeeded) return <div data-testid="seeding">Seeding&hellip;</div>;
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Quote style" className="flex gap-2">
        {(["double", "single"] as const).map((style) => (
          <button
            key={style}
            type="button"
            aria-pressed={settings.quoteStyle === style}
            onClick={() => setDialogueHighlightSettings({ quoteStyle: style })}
          >
            {style}
          </button>
        ))}
      </div>
      <TipTapEditor id="dialogue-editor" value={DOCUMENT} />
    </div>
  );
}

/** Double quotes: only “Go home,” and "Fine," are tinted. */
export const DoubleQuotes: Story = {
  render: () => <DialogueHarness initialQuoteStyle="double" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("group", { name: "Quote style" });
    const marked = await within(canvasElement).findAllByText(
      (_, el) => el?.classList.contains("dialogue-highlight") ?? false,
    );
    await expect(marked.map((el) => el.textContent)).toEqual([
      "“Go home,”",
      '"Fine,"',
    ]);
  },
};

/** Single quotes: the apostrophes in didn’t, don’t and dogs’ are not quotes. */
export const SingleQuotes: Story = {
  // Starts on double quotes and switches while the editor is open, so the
  // store -> editor recompute signal is exercised.
  render: () => <DialogueHarness initialQuoteStyle="double" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "single" }),
    );
    const marked = await within(canvasElement).findAllByText(
      (_, el) => el?.classList.contains("dialogue-highlight") ?? false,
    );
    await expect(marked.map((el) => el.textContent)).toEqual([
      "‘I don’t know,’",
      "'have it your way.'",
    ]);
  },
};
