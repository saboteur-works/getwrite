/** @vitest-environment jsdom */
/**
 * Feature 110, Task 15 (FR-8, FR-10, FR-19): the variant list hook.
 *
 * Field source recorded by Task 1 (f): "store". The fields are read from the
 * resources slice and the project's metadata schema, so a sidebar edit shows
 * without a reload. These tests change the store after mount to name that
 * source. The hook writes nothing.
 */
import React from "react";
import { act, renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
  updateProjectMetadataSchema,
} from "../../src/store/projectsSlice";
import {
  setFolders,
  setResources,
  updateResource,
} from "../../src/store/resourcesSlice";
import {
  NOT_A_VARIANT_MARK,
  useVariantList,
  type VariantListResult,
} from "../../components/Folklore/useVariantList";
import type { FolderSubtypeRead } from "../../src/lib/models/folklore-narratives";
import type {
  AnyResource,
  Folder,
  MetadataSchema,
  SourceResource,
} from "../../src/lib/models/types";

const PROJECT_ID = "proj-variants";

function folder(id: string, parentId: string | null, order = 0): Folder {
  return {
    id,
    slug: id,
    name: `Folder ${id}`,
    type: "folder",
    parentId,
    orderIndex: order,
  } as unknown as Folder;
}

function source(
  id: string,
  order: number,
  over: Partial<SourceResource> = {},
): SourceResource {
  return {
    id,
    slug: id,
    name: `Source ${id}`,
    type: "source",
    folderId: "n1",
    orderIndex: order,
    resourceSubtype: "Variant",
    ...over,
  } as SourceResource;
}

function schemaOf(label = "Teller"): MetadataSchema {
  return {
    groups: [
      {
        id: "g",
        name: "G",
        fields: [
          { key: "teller", label, type: "text", appliesTo: ["Variant"] },
          {
            key: "motifs",
            label: "Motifs",
            type: "multiselect",
            options: ["M1 | a"],
            appliesTo: ["Variant"],
          },
        ],
      },
    ],
  } as unknown as MetadataSchema;
}

const OK_READS: ReadonlyMap<string, FolderSubtypeRead> = new Map([
  ["n1", { kind: "ok", subtype: "Narrative" }],
]);

function setup(
  resources: AnyResource[],
  narrativeId: string | null = "n1",
  reads: ReadonlyMap<string, FolderSubtypeRead> = OK_READS,
  schema: MetadataSchema | null = schemaOf(),
) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      rootPath: `/projects/${PROJECT_ID}`,
      name: "P",
    }),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  if (schema) {
    store.dispatch(
      updateProjectMetadataSchema({ projectId: PROJECT_ID, schema }),
    );
  }
  store.dispatch(setFolders([folder("n1", null)]));
  store.dispatch(setResources(resources));
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(() => useVariantList(narrativeId, reads), {
    wrapper,
  });
  return { ...hook, store };
}

function rowsOf(result: { current: VariantListResult }) {
  if (result.current.kind !== "scope") {
    throw new Error(`expected scope, got ${result.current.kind}`);
  }
  return result.current.rows;
}

describe("useVariantList", () => {
  it("returns every Source in tree order with name and fields under current labels", () => {
    const { result } = setup([
      source("b", 2, { userMetadata: { teller: "Bea" } }),
      source("a", 1, { userMetadata: { teller: "Ann", motifs: ["M1 | a"] } }),
    ]);
    const rows = rowsOf(result);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    const first = rows[0];
    expect(first.kind).toBe("variant");
    if (first.kind !== "variant") return;
    expect(first.name).toBe("Source a");
    expect(first.fields.map((f) => f.label)).toEqual(["Teller", "Motifs"]);
    expect(first.fields[0]).toMatchObject({ state: "set", text: "Ann" });
    expect(first.fields[1]).toMatchObject({ kind: "tags", state: "set" });
  });

  it("reads fields from the store: a sidebar edit and a schema rename show without a reload", () => {
    const { result, store } = setup([
      source("a", 1, { userMetadata: { teller: "Ann" } }),
    ]);
    act(() => {
      store.dispatch(
        updateResource({ id: "a", userMetadata: { teller: "Anna" } }),
      );
      store.dispatch(
        updateProjectMetadataSchema({
          projectId: PROJECT_ID,
          schema: schemaOf("Told by"),
        }),
      );
    });
    const row = rowsOf(result)[0];
    if (row.kind !== "variant") throw new Error("expected variant");
    expect(row.fields[0]).toMatchObject({
      label: "Told by",
      state: "set",
      text: "Anna",
    });
  });

  it("marks a Source without the Variant subtype and keeps it selectable", () => {
    const { result } = setup([
      source("a", 1, { resourceSubtype: undefined }),
      source("b", 2, { resourceSubtype: "Report" }),
    ]);
    const rows = rowsOf(result);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.kind).toBe("not-variant");
      if (row.kind !== "not-variant") continue;
      expect(row.mark).toBe(NOT_A_VARIANT_MARK);
      expect(row.selectable).toBe(true);
    }
    expect(NOT_A_VARIANT_MARK).toBe(
      "not a Variant: teller, date and place do not apply",
    );
  });

  it("returns a variant whose fields could not be read as unreadable with the reason, never with empty fields", () => {
    const bad = source("a", 1, {
      userMetadata: null as unknown as SourceResource["userMetadata"],
    });
    const { result } = setup([bad, source("b", 2)]);
    const [first, second] = rowsOf(result);
    expect(first.kind).toBe("unreadable");
    if (first.kind !== "unreadable") return;
    expect(first.reason).toMatch(/metadata/i);
    expect("fields" in first).toBe(false);
    expect(second.kind).toBe("variant");
  });

  it("returns a variant with no stored metadata as a variant with fields not set", () => {
    const { result } = setup([source("a", 1)]);
    const row = rowsOf(result)[0];
    if (row.kind !== "variant") throw new Error("expected variant");
    expect(row.fields.every((f) => f.state === "not-set")).toBe(true);
  });

  it("works with no tag fields", () => {
    const schema: MetadataSchema = {
      groups: [
        {
          id: "g",
          name: "G",
          fields: [
            {
              key: "teller",
              label: "Teller",
              type: "text",
              appliesTo: ["Variant"],
            },
          ],
        },
      ],
    } as unknown as MetadataSchema;
    const { result } = setup([source("a", 1)], "n1", OK_READS, schema);
    const row = rowsOf(result)[0];
    if (row.kind !== "variant") throw new Error("expected variant");
    expect(row.fields.map((f) => f.key)).toEqual(["teller"]);
  });

  it("returns failed when a folder subtype was not read, never an empty scope", () => {
    const { result } = setup(
      [source("a", 1)],
      "n1",
      new Map([["n1", { kind: "failed", reason: "boom" }]]),
    );
    expect(result.current).toEqual({
      kind: "failed",
      folderId: "n1",
      reason: "boom",
    });
  });

  it("returns missing for an unknown narrative and none when nothing is picked", () => {
    expect(setup([], "gone").result.current.kind).toBe("missing");
    expect(setup([], null).result.current.kind).toBe("none");
  });

  it("returns an empty scope as a scope with no rows", () => {
    expect(rowsOf(setup([]).result)).toEqual([]);
  });

  it("writes nothing: the resources in the store are unchanged by reading", () => {
    const resources = [source("a", 1, { userMetadata: { teller: "Ann" } })];
    const { store } = setup(resources);
    expect(store.getState().resources.resources).toEqual(resources);
  });
});
