"use client";

import React from "react";
import type { AnyResource } from "../../src/lib/models/types";
import { CITATIONS_MODULE_ID } from "../../src/lib/models/citations-types";
import { useModuleEnabled } from "../Modules/useModuleEnabled";
import CollapsibleSection from "../common/UI/CollapsibleSection/CollapsibleSection";
import CitationFieldsEditor from "./CitationFieldsEditor";

/** Shown instead of the editor on the native (Android) runtime. */
export const CITATION_FIELDS_NATIVE_MESSAGE =
  "Citation fields can be edited on desktop and web";

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
  if (!isEnabled || resource.type !== "source") return null;
  const isNative = process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native";
  return (
    <CollapsibleSection title="Citation fields" variant="sidebar">
      {isNative ? (
        <p className="text-gw-label text-gw-secondary">
          {CITATION_FIELDS_NATIVE_MESSAGE}
        </p>
      ) : (
        <CitationFieldsEditor
          key={resource.id}
          projectId={projectId}
          resourceId={resource.id}
        />
      )}
    </CollapsibleSection>
  );
}
