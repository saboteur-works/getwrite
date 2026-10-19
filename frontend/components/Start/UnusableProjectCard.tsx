/**
 * @module Start/UnusableProjectCard
 *
 * Start-page card for a project whose `project.json` exists but cannot be
 * used (Feature 89, FR-4). Built from the locked card's structure: an
 * `<article>` named by its heading. The heading is the folder id, because no
 * name can be trusted. It offers no control of any kind: nothing here can open,
 * rename, delete or package the project.
 */
import {
  FILES_UNCHANGED_SENTENCE,
  UNUSABLE_PROJECT_COPY,
  UNUSABLE_PROJECT_LABEL,
} from "./unusable-project-copy";
import type { UnusableProjectReason } from "../../src/lib/models/unusable-project-reason";

/**
 * Props for {@link UnusableProjectCard}.
 */
export interface UnusableProjectCardProps {
  /** The project's folder id (its directory name); shown as the heading. */
  folderId: string;
  /** Why the project cannot be used. */
  reason: UnusableProjectReason;
}

/**
 * Renders the not-openable card for one unusable project.
 *
 * @param props - {@link UnusableProjectCardProps}.
 * @returns An `<article>` with label, folder-id heading and reason text.
 */
export default function UnusableProjectCard({
  folderId,
  reason,
}: UnusableProjectCardProps): JSX.Element {
  const copy = UNUSABLE_PROJECT_COPY[reason];
  const titleId = `proj-${folderId}-title`;
  return (
    <article
      className="border-hairline border-gw-border start-page-fade-in flex flex-col justify-between p-5"
      aria-labelledby={titleId}
    >
      <div>
        <p className="font-mono text-gw-label uppercase tracking-label text-gw-secondary">
          {UNUSABLE_PROJECT_LABEL}
        </p>
        <h3
          id={titleId}
          className="mt-3 break-all text-gw-h1 font-semibold text-gw-secondary"
        >
          {folderId}
        </h3>
        <p className="mt-3 text-gw-body text-gw-secondary">{copy.reason}</p>
        {copy.filesUnchangedChecked ? (
          <p className="mt-2 text-gw-body text-gw-secondary">
            {FILES_UNCHANGED_SENTENCE}
          </p>
        ) : null}
      </div>
    </article>
  );
}
