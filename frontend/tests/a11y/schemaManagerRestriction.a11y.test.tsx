/**
 * axe-core checks for the schema-manager subtype restriction control in its
 * three story states (custom field, built-in field, stale label). Feature 72,
 * Task 10, FR-29.
 */
import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import SchemaManager from "../../components/SchemaManager/SchemaManager";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { DEFAULT_METADATA_SCHEMA } from "../../src/lib/models/default-metadata-schema";
import type { MetadataSchema } from "../../src/lib/models/types";
import { runAxe } from "./helpers/axe";

function renderWith(options: {
  subtypes?: string[];
  appliesTo?: string[];
  builtInOnly?: boolean;
}): HTMLElement {
  const schema: MetadataSchema = options.builtInOnly
    ? DEFAULT_METADATA_SCHEMA
    : {
        groups: [
          ...DEFAULT_METADATA_SCHEMA.groups,
          {
            id: "custom-group",
            label: "Custom",
            fields: [
              {
                key: "tension",
                label: "Tension",
                type: "text",
                ...(options.appliesTo ? { appliesTo: options.appliesTo } : {}),
              },
            ],
          },
        ],
      };
  const store = makeStore();
  store.dispatch(
    setProject({
      id: "p",
      rootPath: "/p",
      metadataSchema: schema,
      ...(options.subtypes ? { subtypes: options.subtypes } : {}),
    }),
  );
  store.dispatch(setSelectedProjectId("p"));
  render(
    <Provider store={store}>
      <main>
        <SchemaManager />
      </main>
    </Provider>,
  );
  return document.body;
}

describe("SchemaManager restriction control a11y", () => {
  it("has no violations for a custom field", async () => {
    await runAxe(
      renderWith({ subtypes: ["Scene", "Chapter"], appliesTo: ["Scene"] }),
    );
  });

  it("has no violations for a built-in field (no control)", async () => {
    await runAxe(renderWith({ subtypes: ["Scene"], builtInOnly: true }));
  });

  it("has no violations with a stale label", async () => {
    await runAxe(
      renderWith({ subtypes: ["Scene"], appliesTo: ["Scene", "Epilogue"] }),
    );
  });
});
