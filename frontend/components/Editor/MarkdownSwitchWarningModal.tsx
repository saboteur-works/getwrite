/**
 * @module Editor/MarkdownSwitchWarningModal
 *
 * Confirmation modal shown before the editor switches a resource from rich-text
 * to raw Markdown ("Edit as Markdown"). Converting to GitHub-Flavored Markdown
 * is normalizing, not byte-preserving: constructs GFM cannot express are either
 * emitted as inline HTML or dropped, and switching back to rich text does not
 * restore them. This modal states that impact — and, when the live document
 * actually contains such constructs, lists each one — so the user can confirm
 * or cancel before any conversion happens.
 */
import ConfirmDialog from "../common/ConfirmDialog";
import type { MarkdownConstructWarning } from "../../src/lib/export/types";

/** Props for {@link MarkdownSwitchWarningModal}. */
export interface MarkdownSwitchWarningModalProps {
  /** Whether the confirmation modal is visible. */
  isOpen: boolean;
  /**
   * Lossy constructs detected in the current document, as produced by
   * `collectMarkdownWarnings`. Empty when nothing in the document is at risk;
   * the general warning is shown either way.
   */
  warnings: MarkdownConstructWarning[];
  /** Invoked when the user confirms the switch to Markdown editing. */
  onConfirm: () => void;
  /** Invoked when the user cancels and stays in rich-text editing. */
  onCancel: () => void;
}

/** Plain-language effect of each loss kind, shown beside the affected construct. */
const KIND_EFFECT: Record<MarkdownConstructWarning["kind"], string> = {
  "html-fallback": "kept as inline HTML",
  dropped: "removed (the text is kept)",
};

/**
 * Formatting GitHub-Flavored Markdown cannot express, which is therefore
 * stripped on the way into source mode regardless of whether this particular
 * document happens to use it. Shown as an always-present list so the warning is
 * exhaustive: the per-document `warnings` only catch a subset (image links,
 * line spacing, and text/font styling), while several of these — notably text
 * alignment and highlight colour — are dropped silently with no detector.
 */
const ALWAYS_STRIPPED: readonly string[] = [
  "Text, highlight, and background colours",
  "Custom fonts and font sizes",
  "Text alignment — centred, right-aligned, or justified",
  "Paragraph line spacing",
];

/**
 * Renders the "Edit as Markdown?" confirmation built on the shared
 * {@link ConfirmDialog}.
 *
 * The body gives the full picture in three parts: a one-way-conversion warning,
 * an exhaustive list of formatting Markdown can never keep, and — when the live
 * document actually contains detected lossy constructs — a document-specific
 * callout with per-construct counts. Constructs that survive (headings, lists,
 * tables, bold/italic, links, code, wiki links, and math) are intentionally not
 * listed; only what changes is surfaced.
 *
 * @param props - {@link MarkdownSwitchWarningModalProps}.
 *
 * @example
 * <MarkdownSwitchWarningModal
 *   isOpen={pendingWarnings !== null}
 *   warnings={pendingWarnings ?? []}
 *   onConfirm={switchToSource}
 *   onCancel={() => setPendingWarnings(null)}
 * />
 */
export default function MarkdownSwitchWarningModal({
  isOpen,
  warnings,
  onConfirm,
  onCancel,
}: MarkdownSwitchWarningModalProps): JSX.Element {
  const description =
    "Editing as Markdown converts this document to GitHub-Flavored Markdown and " +
    "swaps the rich-text editor for a plain-text one. The conversion is one-way: " +
    "formatting Markdown can't represent is removed when you switch, and " +
    "switching back to rich text won't bring it back.";

  const details = (
    <div className="markdown-switch-warning mt-3 space-y-3 text-sm text-gw-secondary">
      <p>Markdown cannot preserve the following, so it will be removed:</p>
      <ul
        aria-label="Formatting Markdown cannot preserve"
        className="list-disc space-y-1 pl-5"
      >
        {ALWAYS_STRIPPED.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>
        Images linked to other GetWrite resources are kept, but as inline HTML
        rather than portable Markdown.
      </p>
      {warnings.length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium text-gw-primary">Found in this document:</p>
          <ul
            aria-label="Lossy formatting found in this document"
            className="list-disc space-y-1 pl-5"
          >
            {warnings.map((warning) => (
              <li key={warning.construct}>
                {warning.label} ({warning.count}) — {KIND_EFFECT[warning.kind]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  return (
    <ConfirmDialog
      isOpen={isOpen}
      title="Edit as Markdown?"
      description={description}
      details={details}
      confirmLabel="Edit as Markdown"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
