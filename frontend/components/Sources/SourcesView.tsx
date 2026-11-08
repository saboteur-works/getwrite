"use client";

import React from "react";
import { useDispatch } from "react-redux";
import { setSelectedResourceId } from "../../src/store/resourcesSlice";
import Button from "../common/UI/Button/Button";
import { useSourceList } from "./useSourceList";

export interface SourcesViewProps {
  /** Called after a row selects a Source, so the shell can show the editor. */
  onOpenSource?: (resourceId: string) => void;
}

/**
 * The project-scope Sources view (Feature 103, FR-15): every Source of the open
 * project with its subtype and attachment count. Selecting a row selects that
 * Source in the store, which opens it in the editor without the resource tree.
 */
export default function SourcesView({
  onOpenSource,
}: SourcesViewProps): JSX.Element {
  const dispatch = useDispatch();
  const { state, retry } = useSourceList();

  return (
    <section aria-labelledby="sources-view-heading" className="p-4">
      <h2 id="sources-view-heading" className="mb-3 text-sm text-gw-primary">
        Sources
      </h2>
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
              <th scope="col" className="py-1 font-normal">
                Attachments
              </th>
            </tr>
          </thead>
          <tbody>
            {state.rows.map((row) => (
              <tr key={row.id} className="border-t border-gw-border">
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
                <td className="py-1 pr-3 text-gw-secondary">{row.subtype}</td>
                <td className="py-1 text-gw-secondary">
                  {row.attachmentCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
