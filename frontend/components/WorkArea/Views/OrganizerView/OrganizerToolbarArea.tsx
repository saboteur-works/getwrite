import React from "react";
import { shallowEqual } from "react-redux";
import type { AnyResource } from "../../../../src/lib/models/types";
import type { FolderRowMetadata } from "../../../../src/lib/folder-data-rows";
import type {
  OrganizerAxis,
  OrganizerSource,
} from "../../../../src/lib/models/organizer-grid-types";
import useAppSelector from "../../../../src/store/hooks";
import { selectActiveProjectMetadataSchema } from "../../../../src/store/projectsSlice";
import { selectSavedQueriesList } from "../../../../src/store/querySlice";
import OrganizerGridToolbar from "./OrganizerGridToolbar";
import OrganizerArrangementControls from "./OrganizerArrangementControls";
import { getAxisChoices } from "./organizerAxisFields";
import {
  asArrangementResult,
  type UseOrganizerPicksResult,
} from "./useOrganizerPicks";

/**
 * @module OrganizerToolbarArea
 * The whole Organizer toolbar (Feature 109, FR-3, FR-19): Rows and Columns
 * pickers, the source select, the saved-arrangement controls and the text of a
 * refused apply or a remembered arrangement that could not be applied.
 */

export interface OrganizerToolbarAreaProps {
  picks: UseOrganizerPicksResult;
  /** The browsed folder, which the folder sources apply to. */
  folderId: string;
  /** The source's cards, for the axis choices offered. */
  cards: AnyResource[];
  folderMetadataById: Record<string, FolderRowMetadata> | undefined;
}

export default function OrganizerToolbarArea({
  picks,
  folderId,
  cards,
  folderMetadataById,
}: OrganizerToolbarAreaProps): JSX.Element {
  const metadataSchema = useAppSelector(
    (s) => selectActiveProjectMetadataSchema(s),
    shallowEqual,
  );
  const savedQueries = useAppSelector(selectSavedQueriesList, shallowEqual);
  const { effectiveSource, arrangements } = picks;
  const source: OrganizerSource = effectiveSource;
  const axisChoices = getAxisChoices({
    schema: metadataSchema,
    source: source.kind === "smart-folder" ? "smart-folder" : source.scope,
    documentSubtypes: cards
      .filter((c) => c.type !== "folder")
      .map((c) => (c as { resourceSubtype?: string }).resourceSubtype),
    folderSubtypes: cards
      .filter((c) => c.type === "folder")
      .map((c) => folderMetadataById?.[c.id]?.resourceSubtype),
    position: "rows",
    other: "none",
  });
  const message = picks.arrangementMessage ?? arrangements.notice;
  const rows: OrganizerAxis = picks.rowsAxis;
  return (
    <div className="mb-4">
      <OrganizerGridToolbar
        fieldChoices={axisChoices.filter((c) => typeof c.axis !== "string")}
        rows={rows}
        columns={picks.columnsAxis}
        onRowsChange={picks.setRowsAxis}
        onColumnsChange={picks.setColumnsAxis}
        source={source}
        folderId={folderId}
        smartFolders={savedQueries.map((q) => ({ id: q.id, name: q.name }))}
        onSourceChange={picks.chooseSource}
      />
      <div data-organizer-arrangements className="min-w-0 max-w-full mt-2">
        <OrganizerArrangementControls
          arrangements={arrangements.arrangements}
          selectedId={arrangements.appliedId}
          availability={arrangements.availability}
          isChangedSinceApplied={arrangements.isChanged}
          onSelect={picks.selectArrangement}
          onAdd={async (name) =>
            asArrangementResult(await arrangements.save(name))
          }
          onRename={async (id, name) =>
            asArrangementResult(await arrangements.rename(id, name))
          }
          onDelete={async (id) =>
            asArrangementResult(await arrangements.remove(id))
          }
        />
        {message && (
          <p role="status" className="text-xs text-gw-secondary">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
