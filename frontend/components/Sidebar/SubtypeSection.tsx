"use client";

import { useState } from "react";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import { selectResource, updateResource } from "../../src/store/resourcesSlice";
import {
  selectActiveProjectDirectoryId,
  selectActiveProjectSubtypes,
} from "../../src/store/projectsSlice";
import { updateSidecar } from "../../src/lib/api/resources";
import { toastService } from "../../src/lib/toast-service";
import { unknownStatusLabel } from "../../src/lib/status-rollup";
import { normalizeSubtypeLabel } from "../../src/lib/models/field-subtype-scope";
import type { AnyResource } from "../../src/lib/models/types";
import LabeledField from "./controls/LabeledField";
import Select from "../common/UI/Select/Select";

const NO_SUBTYPE_LABEL = "No subtype";
const EMPTY_LIST_HINT =
  "No subtypes yet. Add them in Project Settings, Metadata tab.";
const HINT_ID = "resource-subtype-empty-hint";

/**
 * The write payload for a subtype change. Deliberately only the one key: the
 * sidecar core merges it into the stored sidecar, so no other field of the
 * resource is sent and none can be overwritten by a stale copy (FR-32). A clear
 * is an empty payload plus `clearKeys: ["resourceSubtype"]`.
 */
function subtypePayload(value: string | null): AnyResource {
  return (value === null ? {} : { resourceSubtype: value }) as AnyResource;
}

/**
 * Sidebar control for a resource's `resourceSubtype` (Feature 72, FR-9..FR-12).
 *
 * Unlike `EntitySection.persist`, nothing is shown that was not saved: the
 * select is controlled by the stored value, and Redux is updated only after
 * the sidecar write resolves. A rejected write leaves the stored value in
 * place (so the control reverts) and raises an error toast (FR-12).
 *
 * A stored value that the project list no longer holds (compared under
 * `normalizeSubtypeLabel`) is still shown, labelled as not in the current
 * list, and can be cleared; displaying it writes nothing (FR-10).
 */
export default function SubtypeSection(): JSX.Element | null {
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const resource = useAppSelector((state) => selectResource(state.resources));
  const subtypes = useAppSelector(selectActiveProjectSubtypes);
  const dispatch = useAppDispatch();
  const [isSaving, setIsSaving] = useState(false);

  if (!projectId || !resource) return null;
  if (
    resource.type !== "text" &&
    resource.type !== "image" &&
    resource.type !== "audio"
  ) {
    return null;
  }

  const stored = resource.resourceSubtype;
  const listMatch =
    stored === undefined
      ? undefined
      : subtypes.find(
          (entry) =>
            normalizeSubtypeLabel(entry) === normalizeSubtypeLabel(stored),
        );
  const isStale = stored !== undefined && listMatch === undefined;
  const selectValue = stored === undefined ? "" : (listMatch ?? stored);
  const isEmptyAndUnset = subtypes.length === 0 && stored === undefined;

  const handleChange = (next: string): void => {
    if (isSaving) return;
    const isClearing = next === "";
    setIsSaving(true);
    updateSidecar(
      resource.id,
      projectId,
      subtypePayload(isClearing ? null : next),
      isClearing ? ["resourceSubtype"] : undefined,
    )
      .then(() => {
        // `undefined` must be an explicit key: the reducer merges with a
        // shallow spread, which an omitted key would not overwrite.
        dispatch(
          updateResource({
            ...resource,
            resourceSubtype: isClearing ? undefined : next,
          } as AnyResource),
        );
      })
      .catch(() => {
        toastService.error(
          "Couldn't save the subtype",
          "The previous subtype has been kept. Try again.",
        );
      })
      .finally(() => setIsSaving(false));
  };

  return (
    <div className="mt-0">
      <LabeledField label="Subtype" className="mb-4">
        <Select
          aria-label="Subtype"
          aria-describedby={isEmptyAndUnset ? HINT_ID : undefined}
          className="w-full mt-2"
          value={selectValue}
          disabled={isEmptyAndUnset}
          onChange={(e) => handleChange(e.target.value)}
        >
          <option value="">{NO_SUBTYPE_LABEL}</option>
          {isStale && stored !== undefined && (
            <option value={stored}>{unknownStatusLabel(stored)}</option>
          )}
          {subtypes.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </Select>
        {isEmptyAndUnset && (
          <p id={HINT_ID} className="text-gw-label text-gw-secondary mt-1">
            {EMPTY_LIST_HINT}
          </p>
        )}
      </LabeledField>
    </div>
  );
}
