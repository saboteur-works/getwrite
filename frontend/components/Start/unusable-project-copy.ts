// Last Updated: 2026-10-18

/**
 * @module Start/unusable-project-copy
 *
 * Plain-language card text for each reason category of an unusable project
 * (Feature 89, FR-4/FR-33). Working copy, not owner-reviewed.
 *
 * Keyed by `Record<UnusableProjectReason, ...>`, so a category added to
 * `unusable-project-reason.ts` without copy here fails the typecheck, and the
 * component test that walks `UNUSABLE_PROJECT_REASONS` fails at runtime.
 */
import type { UnusableProjectReason } from "../../src/lib/models/unusable-project-reason";

/** Copy for one reason category. */
export interface UnusableProjectReasonCopy {
  /** What went wrong, in plain language. */
  reason: string;
  /**
   * Whether the card may add "its files are still on disk and unchanged".
   *
   * True only where that is established: the project list only reads, and for
   * these three reasons it read `project.json` and found it unusable. False
   * where the app could not read the file or the project's tree, so nothing
   * about their state was checked.
   */
  filesUnchangedChecked: boolean;
}

/** The sentence added when `filesUnchangedChecked` is true. */
export const FILES_UNCHANGED_SENTENCE =
  "The project’s files are still on disk and unchanged.";

/** Label above the heading of every unusable project card. */
export const UNUSABLE_PROJECT_LABEL = "Project · Cannot be opened";

export const UNUSABLE_PROJECT_COPY: Record<
  UnusableProjectReason,
  UnusableProjectReasonCopy
> = {
  unparseable: {
    reason: "Its project.json file is not valid JSON, so it cannot be opened.",
    filesUnchangedChecked: true,
  },
  "missing-field": {
    reason:
      "Its project.json file is missing its id or creation date, so it cannot be opened.",
    filesUnchangedChecked: true,
  },
  "invalid-manifest": {
    reason:
      "Its project.json file does not match the format GetWrite expects, so it cannot be opened.",
    filesUnchangedChecked: true,
  },
  "manifest-unreadable": {
    reason:
      "Its project.json file exists but could not be read, so it cannot be opened.",
    filesUnchangedChecked: false,
  },
  "tree-unreadable": {
    reason:
      "Its folders or resources could not be read, so it cannot be opened.",
    filesUnchangedChecked: false,
  },
};
