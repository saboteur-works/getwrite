/**
 * @module Editor/MarkdownSourceView
 *
 * Raw Markdown source-editing surface for a text resource. Rendered by
 * {@link TipTapEditor} in place of the rich-text view when the user toggles to
 * "source" mode. Conversion between the TipTap document and GFM happens only at
 * the toggle boundary (in {@link TipTapEditor}); this component is a controlled
 * plain-text editor over the already-serialized Markdown.
 */
import { Code2 } from "lucide-react";

/** Props for {@link MarkdownSourceView}. */
export interface MarkdownSourceViewProps {
  /** Current Markdown source text shown in the textarea. */
  value: string;
  /** Called with the full edited Markdown on every change. */
  onChange: (next: string) => void;
  /** Switch back to the rich-text editor (converts source → document). */
  onExitToRichText: () => void;
  /** Optional DOM id applied to the textarea. */
  id?: string;
}

/**
 * Renders the Markdown source editor: a header with a control to return to the
 * rich-text editor, and a monospace textarea holding the GFM source.
 *
 * @param props - {@link MarkdownSourceViewProps}.
 * @returns The source-editing surface.
 *
 * @example
 * <MarkdownSourceView
 *   value={markdown}
 *   onChange={setMarkdown}
 *   onExitToRichText={() => applyAndSwitchBack()}
 * />
 */
export default function MarkdownSourceView({
  value,
  onChange,
  onExitToRichText,
  id,
}: MarkdownSourceViewProps): JSX.Element {
  return (
    <div
      data-testid="markdown-source-view"
      className="markdown-source-view flex h-full min-h-full flex-col"
    >
      <div className="editor-menubar flex items-center justify-between">
        <span className="font-mono tracking-label text-gw-micro uppercase text-gw-secondary px-2">
          Markdown source
        </span>
        <button
          type="button"
          onClick={onExitToRichText}
          className="editor-menu-icon-button flex items-center gap-1 px-2 text-gw-small"
          aria-label="Switch to rich text editor"
        >
          <Code2 size={16} aria-hidden="true" />
          <span>Rich text</span>
        </button>
      </div>
      <textarea
        id={id}
        aria-label="Markdown source"
        className="tiptap-editor-content flex-1 min-h-0 w-full resize-none bg-transparent px-4 py-4 font-mono text-gw-body leading-relaxed focus:outline-none"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
