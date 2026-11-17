"use client";

import React from "react";
import type { AnyResource } from "../../src/lib/models/types";
import { CITATIONS_MODULE_ID } from "../../src/lib/models/citations-types";
import { useModuleEnabled } from "../Modules/useModuleEnabled";
import { findMissingDetails } from "../../src/lib/models/citations-required-details";
import type { CitationFieldsInput } from "../../src/lib/models/citations-csl-mapper";
import CollapsibleSection from "../common/UI/CollapsibleSection/CollapsibleSection";
import Button from "../common/UI/Button/Button";
import CitationFieldsEditor from "./CitationFieldsEditor";

/** Shown instead of the editor on the native (Android) runtime. */
export const CITATION_FIELDS_NATIVE_MESSAGE =
  "Citation fields can be edited on desktop and web";

/** The bundled style the line is computed for. */
const STILL_NEEDS_STYLE_ID = "chicago-notes-bibliography";
export const NOTHING_MISSING_MESSAGE = "Nothing is missing for this style.";

/** The line for a draft: the missing details, or that nothing is missing. */
function stillNeedsLine(
  fields: CitationFieldsInput | null,
): string | undefined {
  if (fields === null) return undefined;
  const missing = findMissingDetails(STILL_NEEDS_STYLE_ID, fields);
  return missing.length === 0
    ? NOTHING_MISSING_MESSAGE
    : `Still needs: ${missing.join(", ")}`;
}

export interface CitationFieldsSectionProps {
  projectId: string;
  resource: AnyResource;
}

/**
 * The metadata sidebar's Citation fields section (Feature 116, FR-4, FR-7,
 * FR-19). Offered for a Source while the Citations module is on; the Sources
 * switch is not consulted. With the module off it renders nothing and makes
 * no request, so stored values are neither read, rewritten nor deleted. On
 * the native runtime there is no backend for the fields, so a fixed sentence
 * is shown and the editor (which reads on mount) is never mounted.
 */
export default function CitationFieldsSection({
  projectId,
  resource,
}: CitationFieldsSectionProps): JSX.Element | null {
  const isEnabled = useModuleEnabled(CITATIONS_MODULE_ID);
  // Tagged with the Source it came from, so a draft is never read for another.
  const [draft, setDraft] = React.useState<{
    resourceId: string;
    fields: CitationFieldsInput;
  } | null>(null);
  // Set when the writer left a Source with changes that were not written. The
  // editor is gone by then (it is keyed by Source), so the message lives here.
  const [notSaved, setNotSaved] = React.useState<string | null>(null);
  if (!isEnabled || resource.type !== "source") return null;
  const isNative = process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native";
  return (
    <CollapsibleSection title="Citation fields" variant="sidebar">
      {isNative ? (
        <p className="text-gw-label text-gw-secondary">
          {CITATION_FIELDS_NATIVE_MESSAGE}
        </p>
      ) : (
        <>
          {notSaved !== null && (
            <div role="alert" className="mb-3 text-gw-label text-gw-primary">
              <p>{notSaved}</p>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => setNotSaved(null)}
              >
                Dismiss
              </Button>
            </div>
          )}
          <CitationFieldsEditor
            key={resource.id}
            projectId={projectId}
            resourceId={resource.id}
            stillNeeds={stillNeedsLine(
              draft !== null && draft.resourceId === resource.id
                ? draft.fields
                : null,
            )}
            onDraftChange={(fields) =>
              setDraft({ resourceId: resource.id, fields })
            }
            onUnsavedOnLeave={(message) =>
              setNotSaved(`${resource.name}: ${message}`)
            }
          />
        </>
      )}
    </CollapsibleSection>
  );
}
