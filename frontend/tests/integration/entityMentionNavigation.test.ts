/** @vitest-environment jsdom */
/**
 * Integration test (entity-mention-navigation Task 15): end-to-end
 * click-to-jump across the same- and cross-resource cases, plus the
 * staleness no-op, against a real fixture project and a real TipTap/
 * ProseMirror editor instance.
 *
 * Unlike `tests/component/EntityMentionsSection.test.tsx` (which mocks
 * `activeEditorRegistry`/`offset-resolver`/`MentionJumpHighlightExtension`
 * at the module boundary), this test exercises the FULL path end to end:
 *
 * - A real fixture project (in-memory `StorageAdapter`), with a real
 *   mention index built via the actual save-through-persistence/indexing
 *   path (`enqueueIndex`/`flushIndexer`, mirroring
 *   `tests/integration/entity-roster.test.tsx`'s convention) — not
 *   hand-built offsets.
 * - The real `EntityMentionsSection` component, rendered with a real
 *   `Editor` (`@tiptap/core`) instance registered through the real,
 *   unmocked `activeEditorRegistry.ts` — the same seam `TipTapEditor.tsx`/
 *   `EditView.tsx` use in production, just driven directly here since
 *   `EditView` and `MetadataSidebar` are sibling subtrees with no shared
 *   React context (per that module's own doc comment).
 * - The real, unmocked `offset-resolver.ts` (`resolveOffsetToPosition`/
 *   `isOffsetStillAMention`) and the real, unmocked
 *   `MentionJumpHighlightExtension` — mounted as a real ProseMirror plugin
 *   on the real editor, so the one-shot highlight decoration this test
 *   asserts on is the actual plugin state, not a mock call.
 *
 * Only the HTTP transport boundary is mocked (`fetch` for
 * `getEntityMentionedIn`/`getEntityCooccurrence`, and the alias-table
 * transport), fed with the *real* model-layer output for this fixture —
 * the same pattern `entity-roster.test.tsx` uses and for the same reason:
 * the component never makes a real network round-trip in this test
 * environment, but the data it receives is produced by the real
 * `mentions-core.ts`/`entity-alias-table.ts` functions against the real
 * fixture, not a hand-built stand-in.
 *
 * Written as `.test.ts` (not `.test.tsx`) per this task's file path; all
 * React element construction below uses `React.createElement` rather than
 * JSX syntax, which this extension cannot parse. The `@vitest-environment
 * jsdom` docblock opts this file into a DOM despite the `.test.ts` default
 * (`node`) environment — the same precedent `tests/integration/
 * entity-scoped-compile.test.ts` and `tests/unit/
 * editor-document-load-history.test.ts` already establish.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { Editor } from "@tiptap/core";
import type { Content } from "@tiptap/react";

import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import MentionJumpHighlightExtension, {
  MENTION_JUMP_HIGHLIGHT_KEY,
} from "../../components/Editor/Extensions/MentionJumpHighlightExtension";
import {
  setActiveEditor,
  setActiveEditorResourceId,
} from "../../components/Editor/activeEditorRegistry";
import EntityMentionsSection, {
  STALE_MENTION_JUMP_TOAST_ID,
} from "../../components/Sidebar/EntityMentionsSection";
import EntityMentionsProvider from "../../components/Sidebar/EntityMentionsContext";

import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import {
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import { fetchEntityAliasTable } from "../../src/store/entityAliasTableSlice";

import { createTextResource } from "../../src/lib/models/resource";
import { writeResourceToFile } from "../../src/lib/models/resource-persistence";
import { writeSidecar } from "../../src/lib/models/sidecar";
import { enqueueIndex, flushIndexer } from "../../src/lib/models/indexer-queue";
import { buildEntityAliasTable } from "../../src/lib/models/entity-alias-table";
import {
  getEntityMentionedIn,
  type EntityMentionedIn,
} from "../../src/lib/models/mentions-core";
import { plainTextToTipTapDocument } from "../../src/lib/models/tiptap-doc";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter } from "../../src/lib/models/io";

// Only the HTTP transport boundary is mocked — see the module doc comment
// above for why the resolver/registry/highlight-extension modules are left
// real and unmocked.
vi.mock("../../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTable: vi.fn(),
}));

const toastError = vi.fn();
vi.mock("../../src/lib/toast-service", () => ({
  toastService: { error: (...a: unknown[]) => toastError(...a) },
}));

import { getEntityAliasTable } from "../../src/lib/api/entity-alias-table";

const mockedGetEntityAliasTable = vi.mocked(getEntityAliasTable);

const PROJECT_ROOT = "/projects/entity-mention-navigation-fixture";
const PROJECT_ID = "entity-mention-navigation-fixture";

/** The entity's own prose: two paragraphs, a multi-block-node document per
 * Task 15's "Files"/"What" requirement. Paragraph 1 names no one; paragraph
 * 2 opens with "Aria" — exactly one occurrence in this resource, so a
 * resolved position's surrounding text can only ever mean this one mention,
 * never an ambiguous second candidate. */
const ENTITY_PARAGRAPH_1 =
  "Opening narration with no name mentioned here at all.";
const ENTITY_PARAGRAPH_2 = "Aria walked through the quiet garden alone.";
const ENTITY_PLAIN_TEXT = `${ENTITY_PARAGRAPH_1}\n${ENTITY_PARAGRAPH_2}`;

/** A second, unrelated resource (not itself a declared entity) whose prose
 * also mentions "Aria" once — the cross-resource case. Single paragraph. */
const CROSS_RESOURCE_TEXT =
  "Quiet evening settled in. Aria returned home before dark.";

const editors: Editor[] = [];

/** Mounts a real `@tiptap/core` `Editor` against `doc`, using the same
 * extension list `TipTapEditor.tsx` uses (`baseSchemaExtensions`) plus the
 * real `MentionJumpHighlightExtension` — so the one-shot highlight this test
 * asserts on is a real ProseMirror plugin decoration, not a mock call. */
function mountEditor(
  doc: ReturnType<typeof plainTextToTipTapDocument>,
): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: [...baseSchemaExtensions, MentionJumpHighlightExtension],
    content: doc as unknown as Content,
  });
  editors.push(editor);
  return editor;
}

/** `screen.findByText`'s default matcher normalizes the DOM's own text
 * before comparing it, but does NOT normalize a plain-string needle against
 * it — so a needle containing a literal newline (as a multi-paragraph
 * snippet's text does) never matches the space-joined, normalized DOM text
 * it is compared against. This builds a normalizing function-matcher
 * instead, collapsing whitespace on both sides before comparing, matching
 * only a `<button>` element specifically (there is always exactly one
 * button rendering any given snippet's text in this fixture). */
function normalizedButtonTextMatcher(
  expected: string,
): (content: string, element: Element | null) => boolean {
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  const target = normalize(expected);
  return (content, element) =>
    element?.tagName === "BUTTON" && normalize(content) === target;
}

/** Reads the real jump-highlight decoration spans currently set on
 * `editor`'s state, via the real, unmocked extension's own plugin key. */
function readJumpHighlightSpans(
  editor: Editor,
): Array<{ from: number; to: number }> {
  const decorationSet = MENTION_JUMP_HIGHLIGHT_KEY.getState(editor.state) as {
    find: () => Array<{ from: number; to: number }>;
  };
  return decorationSet.find().map((d) => ({ from: d.from, to: d.to }));
}

/** Builds the fixture project on the in-memory adapter: the declared entity
 * "Aria" (a multi-block-node resource mentioning itself once) and a second,
 * unrelated resource mentioning it once more — then runs the real indexing
 * path so the mention index's offsets are genuinely detected, not
 * hand-built. */
async function buildFixture(): Promise<{
  entityResourceId: string;
  crossResourceId: string;
}> {
  const entityResource = createTextResource({
    name: "Aria",
    plainText: ENTITY_PLAIN_TEXT,
  });
  await writeResourceToFile(PROJECT_ROOT, entityResource);
  await writeSidecar(PROJECT_ROOT, entityResource.id, {
    name: "Aria",
    entityKind: "character",
    aliases: [],
  });

  const crossResource = createTextResource({
    name: "Chapter Two",
    plainText: CROSS_RESOURCE_TEXT,
  });
  await writeResourceToFile(PROJECT_ROOT, crossResource);

  await enqueueIndex(PROJECT_ROOT, entityResource.id);
  await flushIndexer(2000);
  await enqueueIndex(PROJECT_ROOT, crossResource.id);
  await flushIndexer(2000);

  return {
    entityResourceId: entityResource.id,
    crossResourceId: crossResource.id,
  };
}

afterEach(() => {
  while (editors.length > 0) {
    editors.pop()?.destroy();
  }
  setActiveEditor(null);
  setActiveEditorResourceId(null);
  vi.restoreAllMocks();
  toastError.mockClear();
});

describe("entity mention navigation — end-to-end click-to-jump (FR-3, FR-4, FR-5, FR-9)", () => {
  beforeEach(() => {
    setStorageAdapter(createMemoryAdapter());
  });

  it("jumps to the exact recorded offset in the same resource, jumps correctly after a cross-resource switch, and no-ops with a toast once the destination goes stale", async () => {
    const { entityResourceId, crossResourceId } = await buildFixture();

    // Ground truth: the real model layer's own output for this fixture —
    // never hand-built. `getEntityMentionedIn` here is the *model* function
    // (`mentions-core.ts`), read directly against the fixture; the
    // component itself reads an HTTP-mocked copy of this same data below.
    const rows = await getEntityMentionedIn(PROJECT_ROOT, entityResourceId);
    const selfRow = rows.find(
      (r: EntityMentionedIn) => r.resourceId === entityResourceId,
    );
    const crossRow = rows.find(
      (r: EntityMentionedIn) => r.resourceId === crossResourceId,
    );
    expect(selfRow).toBeDefined();
    expect(crossRow).toBeDefined();

    // Sanity on the fixture's ground truth, independent of any resolver:
    // the recorded offset is exactly where "Aria" starts in the persisted
    // plain text (paragraph 1's length, plus the one synthetic newline
    // `tiptapToPlainText` inserts between paragraphs).
    const expectedSelfOffset = ENTITY_PARAGRAPH_1.length + 1;
    expect(selfRow!.offsets[0]).toBe(expectedSelfOffset);
    const expectedCrossOffset = CROSS_RESOURCE_TEXT.indexOf("Aria");
    expect(crossRow!.offsets[0]).toBe(expectedCrossOffset);

    const aliasTable = await buildEntityAliasTable(PROJECT_ROOT);
    mockedGetEntityAliasTable.mockResolvedValue(aliasTable);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input.toString();
      if (url.includes("/mentioned-in")) {
        return {
          ok: true,
          json: async () => ({ mentionedIn: rows }),
        } as Response;
      }
      if (url.includes("/entity-cooccurrence")) {
        return { ok: true, json: async () => ({}) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const entityResource = createTextResource({
      name: "Aria",
      plainText: ENTITY_PLAIN_TEXT,
    });
    (entityResource as unknown as { id: string }).id = entityResourceId;
    entityResource.entityKind = "character";

    const crossResource = createTextResource({
      name: "Chapter Two",
      plainText: CROSS_RESOURCE_TEXT,
    });
    (crossResource as unknown as { id: string }).id = crossResourceId;

    const store = makeStore();
    store.dispatch(
      setProject({ id: PROJECT_ID, name: "Fixture", rootPath: PROJECT_ROOT }),
    );
    store.dispatch(setSelectedProjectId(PROJECT_ID));
    store.dispatch(setResources([entityResource, crossResource]));
    store.dispatch(setSelectedResourceId(entityResourceId));
    await store.dispatch(fetchEntityAliasTable(PROJECT_ID));

    // Real editor #1: the entity's own document, mounted and registered as
    // the live editor exactly as `TipTapEditor.tsx`/`EditView.tsx` would.
    const entityDoc = plainTextToTipTapDocument(ENTITY_PLAIN_TEXT);
    const editorA = mountEditor(entityDoc);
    setActiveEditor(editorA);
    setActiveEditorResourceId(entityResourceId);

    render(
      // `Provider`'s own prop type requires `children`, which conflicts with
      // `React.createElement`'s positional-children overload under this
      // React version's types; passing it positionally (the idiomatic shape
      // were JSX available) is the one disallowed by `react/no-children-prop`
      // below, not an actual anti-pattern — there is no JSX in a `.test.ts`
      // file, per this task's required file path.
      // eslint-disable-next-line react/no-children-prop
      React.createElement(Provider, {
        store,
        children: React.createElement(
          EntityMentionsProvider,
          null,
          React.createElement(EntityMentionsSection),
        ),
      }),
    );

    // --- Scenario 1: same-resource click-to-jump (FR-3, FR-4) -----------

    const selfSnippetButton = await screen.findByText(
      normalizedButtonTextMatcher(selfRow!.snippets[0]),
    );

    fireEvent.click(selfSnippetButton);

    // Independent position-level ground truth: for a two-paragraph
    // ProseMirror document, the first character of paragraph 2's text sits
    // at `paragraph1.nodeSize + 1` (paragraph 1's own nodeSize — its content
    // plus its open/close tokens — places paragraph 2's own open token
    // immediately after it; +1 steps past that token into its text). This
    // is computed from paragraph 1's own live node size, not the persisted
    // offset, so it cannot agree with `resolveOffsetToPosition`'s answer by
    // coincidentally sharing the same formula bug.
    const paragraph1Node = editorA.state.doc.content.firstChild;
    expect(paragraph1Node).not.toBeNull();
    const expectedSelfPosition = paragraph1Node!.nodeSize + 1;

    await waitFor(() => {
      expect(editorA.state.selection.from).toBe(expectedSelfPosition);
    });
    expect(editorA.state.selection.to).toBe(expectedSelfPosition);
    // The landed position's own text reads "Aria" — the resolved PM
    // position genuinely corresponds to the mention index's recorded
    // character offset, not merely "some position moved".
    expect(
      editorA.state.doc.textBetween(
        expectedSelfPosition,
        expectedSelfPosition + "Aria".length,
      ),
    ).toBe("Aria");

    const selfHighlights = readJumpHighlightSpans(editorA);
    expect(selfHighlights).toEqual([
      { from: expectedSelfPosition, to: expectedSelfPosition + "Aria".length },
    ]);

    // --- Scenario 3 (asserted here, same resource, before switching away):
    // staleness no-op (FR-9) — mutate the live document so the recorded
    // offset no longer reads as a mention, then click the same snippet
    // again. -----------------------------------------------------------

    const mutatedParagraph2 = "Someone else walked through the garden alone.";
    editorA.commands.setContent(
      plainTextToTipTapDocument(
        `${ENTITY_PARAGRAPH_1}\n${mutatedParagraph2}`,
      ) as unknown as Content,
    );

    // Captured AFTER the mutation (which itself moves the selection and
    // leaves the earlier highlight decoration mapped onto the new content)
    // and BEFORE the click, so the assertion below isolates what the STALE
    // CLICK ITSELF does — nothing — rather than also catching `setContent`'s
    // own, expected and unrelated, selection move.
    const selectionBeforeStaleClick = editorA.state.selection.from;
    const highlightsBeforeStaleClick = readJumpHighlightSpans(editorA);

    fireEvent.click(selfSnippetButton);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    const staleToastCall = toastError.mock.calls.find(
      (call) =>
        (call[2] as { id?: string } | undefined)?.id ===
        STALE_MENTION_JUMP_TOAST_ID,
    );
    expect(staleToastCall).toBeDefined();

    // No selection, scroll, or highlight change from the stale click: the
    // selection/highlight recorded immediately before this click are
    // unchanged after it (`setContent` itself moves/maps them, but the
    // click handler must not add to or alter that).
    expect(editorA.state.selection.from).toBe(selectionBeforeStaleClick);
    expect(readJumpHighlightSpans(editorA)).toEqual(highlightsBeforeStaleClick);

    // --- Scenario 2: cross-resource click-to-jump (FR-5) -----------------
    // The second resource's document, mounted but deliberately NOT yet
    // registered as the live editor — simulating `EditView.tsx` still
    // loading the newly selected resource's content.
    const crossDoc = plainTextToTipTapDocument(CROSS_RESOURCE_TEXT);
    const editorB = mountEditor(crossDoc);

    let hasSwitched = false;
    const unsubscribe = store.subscribe(() => {
      if (
        !hasSwitched &&
        store.getState().resources.selectedResourceId === crossResourceId
      ) {
        hasSwitched = true;
        // A deliberate delay longer than one `waitForResourceContentLoaded`
        // poll interval (25ms, per `EntityMentionsSection.tsx`), so the
        // click handler's poll loop genuinely has to wait rather than
        // observing an instantaneous swap on its very first check.
        setTimeout(() => {
          setActiveEditor(editorB);
          setActiveEditorResourceId(crossResourceId);
        }, 60);
      }
    });

    const crossSnippetButton = await screen.findByText(
      normalizedButtonTextMatcher(crossRow!.snippets[0]),
    );
    fireEvent.click(crossSnippetButton);

    await waitFor(() => {
      expect(store.getState().resources.selectedResourceId).toBe(
        crossResourceId,
      );
    });

    const expectedCrossPosition = expectedCrossOffset + 1; // single-paragraph doc: text starts at PM position 1.

    await waitFor(
      () => {
        expect(editorB.state.selection.from).toBe(expectedCrossPosition);
      },
      { timeout: 6000 },
    );
    expect(
      editorB.state.doc.textBetween(
        expectedCrossPosition,
        expectedCrossPosition + "Aria".length,
      ),
    ).toBe("Aria");
    expect(readJumpHighlightSpans(editorB)).toEqual([
      {
        from: expectedCrossPosition,
        to: expectedCrossPosition + "Aria".length,
      },
    ]);

    // The jump never touched the previous (now-stale) editor instance.
    expect(editorA.state.selection.from).toBe(selectionBeforeStaleClick);

    unsubscribe();
  }, 20000);
});
