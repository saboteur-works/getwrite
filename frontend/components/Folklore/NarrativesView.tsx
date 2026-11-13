/**
 * Feature 110 (folklore variants), Task 5: placeholder body of the
 * "Narratives" Work Area tab. The module registry renders it so the tab
 * resolves; Task 20 replaces it with the real view.
 */
import React from "react";
import { FOLKLORE_VIEW_LABEL } from "../../src/lib/models/folklore-types";

export default function NarrativesView(): JSX.Element {
  return (
    <section aria-labelledby="narratives-view-heading">
      <h2 id="narratives-view-heading" className="workarea-section-title">
        {FOLKLORE_VIEW_LABEL}
      </h2>
    </section>
  );
}
