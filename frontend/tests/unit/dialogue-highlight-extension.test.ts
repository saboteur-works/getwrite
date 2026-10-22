/**
 * The editor's dialogue highlight: a view-only decoration over quoted
 * speech, driven by a session-only setting (on/off, double/single quotes).
 * Exercised against a plain EditorState, as the entity highlight tests are.
 */
import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EditorState } from "@tiptap/pm/state";
import type { DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import DialogueHighlightExtension, {
  buildDialogueHighlightDecorations,
  DIALOGUE_HIGHLIGHT_KEY,
  type DialogueHighlightSettings,
} from "../../components/Editor/Extensions/DialogueHighlightExtension";

const schema = getSchema([StarterKit]);

function docFromParagraphs(...paragraphs: string[]): ProseMirrorNode {
  return schema.nodeFromJSON({
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: text ? [{ type: "text", text }] : [],
    })),
  });
}

function highlighted(doc: ProseMirrorNode, set: DecorationSet): string[] {
  return set
    .find()
    .sort((a, b) => a.from - b.from)
    .map((d) => doc.textBetween(d.from, d.to, "\n"));
}

const on = (quoteStyle: "double" | "single"): DialogueHighlightSettings => ({
  isEnabled: true,
  quoteStyle,
});

describe("buildDialogueHighlightDecorations", () => {
  it("marks nothing while the highlight is off", () => {
    const doc = docFromParagraphs('He said "go home".');
    const set = buildDialogueHighlightDecorations(doc, {
      isEnabled: false,
      quoteStyle: "double",
    });
    expect(set.find()).toHaveLength(0);
  });

  it("marks double-quoted speech, quote marks included", () => {
    const doc = docFromParagraphs('He said "go home" and “stay”.');
    expect(
      highlighted(doc, buildDialogueHighlightDecorations(doc, on("double"))),
    ).toEqual(['"go home"', "“stay”"]);
  });

  it("marks single-quoted speech in single mode only", () => {
    const doc = docFromParagraphs('‘I don’t know,’ she said. "Fine."');
    expect(
      highlighted(doc, buildDialogueHighlightDecorations(doc, on("single"))),
    ).toEqual(["‘I don’t know,’"]);
  });

  it("maps speech in a later paragraph to the right positions", () => {
    const doc = docFromParagraphs(
      "Narration first.",
      "",
      'Then "speech" here.',
    );
    expect(
      highlighted(doc, buildDialogueHighlightDecorations(doc, on("double"))),
    ).toEqual(['"speech"']);
  });

  it("uses the dialogue-highlight class", () => {
    const doc = docFromParagraphs('"Hi."');
    const [decoration] = buildDialogueHighlightDecorations(
      doc,
      on("double"),
    ).find();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((decoration as any).type.attrs.class).toBe("dialogue-highlight");
  });
});

describe("DialogueHighlightExtension plugin", () => {
  function stateWith(settings: { current: DialogueHighlightSettings }) {
    const configured = DialogueHighlightExtension.configure({
      getSettings: () => settings.current,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [plugin] = (configured as any).config.addProseMirrorPlugins.call(
      configured,
    );
    return EditorState.create({
      doc: docFromParagraphs('She said "yes".'),
      plugins: [plugin],
    });
  }

  it("recomputes on a settings signal without changing the document", () => {
    const settings = {
      current: { isEnabled: false, quoteStyle: "double" as const },
    };
    let state = stateWith(settings);
    const plugin = state.plugins[0];
    expect((plugin.getState(state) as DecorationSet).find()).toHaveLength(0);

    settings.current = { isEnabled: true, quoteStyle: "double" };
    const tr = state.tr.setMeta(DIALOGUE_HIGHLIGHT_KEY, true);
    expect(tr.docChanged).toBe(false);
    state = state.apply(tr);

    expect(
      highlighted(state.doc, plugin.getState(state) as DecorationSet),
    ).toEqual(['"yes"']);
  });
});
