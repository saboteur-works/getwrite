"use client";

import React from "react";
import { useDispatch } from "react-redux";
import type { ReactNode } from "react";
import useAppSelector from "../../src/store/hooks";
import {
  selectResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import type { SourceResource } from "../../src/lib/models/types";
import Button from "../common/UI/Button/Button";
import { useSourceList } from "./useSourceList";
import {
  CreateSourceControl,
  RenameSourceControl,
  useSourceActions,
} from "./SourcesViewControls";

export interface SourcesViewProps {
  /** Called after a row selects a Source, so the shell can show the editor. */
  onOpenSource?: (resourceId: string) => void;
  /**
   * The attachments section for one Source, supplied by the registry's
   * attachments slot (a prop, so this view does not import the registry). With
   * none, rows offer no attachments toggle.
   */
  renderAttachments?: (resource: SourceResource) => ReactNode;
}

/**
 * The project-scope Sources view (Feature 103, FR-15): every Source of the open
 * project with its subtype and attachment count. Selecting a row selects that
 * Source in the store, which opens it in the editor without the resource tree.
 */
export default function SourcesView({
  onOpenSource,
  renderAttachments,
}: SourcesViewProps): JSX.Element {
  const dispatch = useDispatch();
  const { state, retry } = useSourceList();
  const actions = useSourceActions();
  const resources = useAppSelector((s) => selectResources(s.resources));
  const [openAttachmentsId, setOpenAttachmentsId] = React.useState<
    string | null
  >(null);

  return (
    <section aria-labelledby="sources-view-heading" className="p-4">
      <h2 id="sources-view-heading" className="mb-3 text-sm text-gw-primary">
        Sources
      </h2>
      <div className="mb-3">
        <CreateSourceControl createSource={actions.createSource} />
      </div>
      {state.status === "loading" && (
        <p role="status" className="text-gw-label text-gw-secondary">
          Loading Sources.
        </p>
      )}
      {state.status === "failed" && (
        <div role="alert" className="text-gw-label text-gw-primary">
          <p className="mb-2">
            {state.isLocked
              ? "This project is locked, so its Sources cannot be listed. Unlock it to see them."
              : `The Sources could not be listed. ${state.message}`}
          </p>
          <Button variant="secondary" size="xs" onClick={retry}>
            Try again
          </Button>
        </div>
      )}
      {state.status === "empty" && (
        <p className="text-gw-label text-gw-secondary">
          No Sources in this project.
        </p>
      )}
      {state.status === "ready" && (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Sources in this project</caption>
          <thead>
            <tr className="text-gw-label text-gw-secondary">
              <th scope="col" className="py-1 pr-3 font-normal">
                Name
              </th>
              <th scope="col" className="py-1 pr-3 font-normal">
                Subtype
              </th>
              <th scope="col" className="py-1 pr-3 font-normal">
                Attachments
              </th>
              <th scope="col" className="py-1 font-normal">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {state.rows.map((row) => {
              const source = resources.find(
                (resource): resource is SourceResource =>
                  resource.id === row.id && resource.type === "source",
              );
              const isOpen = openAttachmentsId === row.id;
              return (
                <React.Fragment key={row.id}>
                  <tr className="border-t border-gw-border">
                    <th scope="row" className="py-1 pr-3 font-normal">
                      <button
                        type="button"
                        className="text-left text-gw-primary underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gw-border"
                        onClick={() => {
                          dispatch(setSelectedResourceId(row.id));
                          onOpenSource?.(row.id);
                        }}
                      >
                        {row.name}
                      </button>
                    </th>
                    <td className="py-1 pr-3 text-gw-secondary">
                      {row.subtype}
                    </td>
                    <td className="py-1 pr-3 text-gw-secondary">
                      {row.attachmentCount}
                    </td>
                    <td className="py-1">
                      <div className="flex flex-wrap gap-2">
                        <RenameSourceControl
                          resourceId={row.id}
                          name={row.name}
                          renameSource={actions.renameSource}
                        />
                        {renderAttachments && source && (
                          <Button
                            variant="secondary"
                            size="xs"
                            aria-expanded={isOpen}
                            aria-controls={`source-attachments-${row.id}`}
                            aria-label={`${isOpen ? "Hide" : "Show"} attachments of ${row.name}`}
                            onClick={() =>
                              setOpenAttachmentsId(isOpen ? null : row.id)
                            }
                          >
                            Attachments
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {renderAttachments && source && isOpen && (
                    <tr>
                      <td
                        colSpan={4}
                        id={`source-attachments-${row.id}`}
                        className="pb-3 pl-4"
                      >
                        {renderAttachments(source)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
