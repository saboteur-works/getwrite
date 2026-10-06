import React from "react";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import EntityMentionsSection from "../../components/Sidebar/EntityMentionsSection";
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
import { createTextResource } from "../../src/lib/models/resource";
import type { AnyResource } from "../../src/lib/models/types";
import type { EntityMentionedIn } from "../../src/lib/models/mentions-core";
import { runAxe } from "./helpers/axe";
import { MENTION_JUMP_HIGHLIGHT_CLASS } from "../../components/Editor/Extensions/MentionJumpHighlightExtension";

/**
 * Task 14 (`specs/features/entity-mention-navigation.md`, FR-7) — the
 * accessibility-verification pass for the mention-snippet click targets Task
 * 11/Task 12 introduced in `EntityMentionsSection.tsx`. This covers the scope
 * those tasks' own tests (`frontend/tests/component/EntityMentionsSection
 * .test.tsx`) deliberately left out: a real axe-core check against the
 * snippet-button markup, Tab-reachability, Enter/Space activation parity (the
 * convention `organizerCard.a11y.test.tsx`'s title-button pass already
 * established for this codebase), and a check that the transient jump
 * highlight (`MentionJumpHighlightExtension.ts`) is not color-only.
 *
 * `EntityMentionsSection` always needs a Redux `Provider` and
 * `EntityMentionsProvider` (it reads the selected resource/project from the
 * store and fetches its rows through that context) — this file mirrors
 * `EntityMentionsSection.test.tsx`'s own store/fetch setup rather than
 * inventing a second one, since that is this component's own established
 * test harness, not a Storybook story (none exists for this component today
 * — see this task's handback report for why one was not added).
 */

vi.mock("../../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTable: vi.fn(),
}));
vi.mock("../../components/Editor/activeEditorRegistry", () => ({
  getActiveEditor: vi.fn(),
  getActiveEditorResourceId: vi.fn(),
}));
vi.mock("../../components/Editor/offset-resolver", () => ({
  resolveOffsetToPosition: vi.fn(),
  isOffsetStillAMention: vi.fn(),
}));
vi.mock(
  "../../components/Editor/Extensions/MentionJumpHighlightExtension",
  async () => {
    const actual = await vi.importActual<
      typeof import("../../components/Editor/Extensions/MentionJumpHighlightExtension")
    >("../../components/Editor/Extensions/MentionJumpHighlightExtension");
    return { ...actual, applyMentionJumpHighlight: vi.fn() };
  },
);
vi.mock("../../src/lib/api/mention-highlight-duration", () => ({
  resolveMentionHighlightDurationSeconds: vi.fn(() => 2),
}));

import {
  getActiveEditor,
  getActiveEditorResourceId,
} from "../../components/Editor/activeEditorRegistry";
import {
  resolveOffsetToPosition,
  isOffsetStillAMention,
} from "../../components/Editor/offset-resolver";
import { applyMentionJumpHighlight } from "../../components/Editor/Extensions/MentionJumpHighlightExtension";

const mockedGetActiveEditor = vi.mocked(getActiveEditor);
const mockedGetActiveEditorResourceId = vi.mocked(getActiveEditorResourceId);
const mockedResolveOffsetToPosition = vi.mocked(resolveOffsetToPosition);
const mockedIsOffsetStillAMention = vi.mocked(isOffsetStillAMention);
const mockedApplyMentionJumpHighlight = vi.mocked(applyMentionJumpHighlight);

/**
 * Minimal chainable fake editor matching the `editor.chain()
 * .setTextSelection().scrollIntoView().run()` sequence `handleSnippetClick`
 * invokes, mirroring `EntityMentionsSection.test.tsx`'s own helper of the
 * same shape.
 */
function createFakeEditor() {
  const run = vi.fn();
  const scrollIntoView = vi.fn(() => ({ run }));
  const setTextSelection = vi.fn(() => ({ scrollIntoView }));
  const chain = vi.fn(() => ({ setTextSelection }));
  const fakeDoc = { content: { size: 1000 }, textBetween: () => "" } as unknown;
  const fakeView = {} as unknown;
  return {
    editor: { state: { doc: fakeDoc }, chain, view: fakeView },
    chain,
    setTextSelection,
    scrollIntoView,
    run,
    doc: fakeDoc,
    view: fakeView,
  };
}

const PROJECT_PATH = "/tmp/test-project";

function setupStore(resourceId: string, overrides: Partial<AnyResource> = {}) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: "proj-test-1",
      name: "Test Project",
      rootPath: PROJECT_PATH,
    }),
  );
  store.dispatch(setSelectedProjectId("proj-test-1"));
  const res = createTextResource({ name: "Aria" });
  (res as unknown as { id: string }).id = resourceId;
  Object.assign(res, { entityKind: "character" }, overrides);
  store.dispatch(setResources([res]));
  store.dispatch(setSelectedResourceId(resourceId));
  return store;
}

function mockMentionedIn(mentionedIn: EntityMentionedIn[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input.toString();
    if (url.includes("/mentioned-in")) {
      return { ok: true, json: async () => ({ mentionedIn }) } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
}

const SNIPPET_ROW: EntityMentionedIn = {
  resourceId: "entity-aria",
  name: "Aria",
  snippets: ["Aria drew her own blade."],
  offsets: [5],
  isLinked: false,
  isMentioned: true,
  ambiguousWith: [[]],
};

function renderSection(store: ReturnType<typeof setupStore>) {
  return render(
    <Provider store={store}>
      <EntityMentionsProvider>
        <EntityMentionsSection />
      </EntityMentionsProvider>
    </Provider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  mockedGetActiveEditor.mockClear();
  mockedGetActiveEditorResourceId.mockClear();
  mockedResolveOffsetToPosition.mockClear();
  mockedIsOffsetStillAMention.mockClear();
  mockedApplyMentionJumpHighlight.mockClear();
});

describe("a11y: EntityMentionsSection mention-snippet buttons", () => {
  it("axe reports zero violations for the rendered snippet-button markup", async () => {
    mockMentionedIn([SNIPPET_ROW]);
    const store = setupStore("entity-aria");

    const { container } = renderSection(store);
    await screen.findByText("Aria drew her own blade.");
    await runAxe(container);
  });

  it("a mention-snippet button is reachable via Tab and is a native <button>, not a role=button widget", async () => {
    mockMentionedIn([SNIPPET_ROW]);
    const store = setupStore("entity-aria");
    const user = userEvent.setup();

    renderSection(store);
    const snippetButton = await screen.findByRole("button", {
      name: "Aria drew her own blade.",
    });
    expect(snippetButton.tagName).toBe("BUTTON");

    // Tab from the top of the document reaches the snippet button — it is
    // a plain native <button> with no explicit tabIndex override, so this
    // also confirms nothing in this component's markup pulled it out of the
    // natural tab order. The row's own resource-name button comes first in
    // document order (`Aria`), so two tabs land on the snippet button.
    await user.tab();
    await user.tab();
    expect(snippetButton).toHaveFocus();
  });

  it("activates the same jump behavior on Enter as on a click", async () => {
    mockMentionedIn([SNIPPET_ROW]);
    const store = setupStore("entity-aria");
    const user = userEvent.setup();

    const fake = createFakeEditor();
    mockedGetActiveEditor.mockReturnValue(fake.editor as never);
    mockedResolveOffsetToPosition.mockReturnValue(7);
    mockedIsOffsetStillAMention.mockReturnValue(true);

    renderSection(store);
    const snippetButton = await screen.findByRole("button", {
      name: "Aria drew her own blade.",
    });

    snippetButton.focus();
    expect(snippetButton).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(fake.setTextSelection).toHaveBeenCalledWith(7);
    expect(fake.scrollIntoView).toHaveBeenCalled();
    expect(mockedApplyMentionJumpHighlight).toHaveBeenCalledTimes(1);
  });

  it("activates the same jump behavior on Space as on a click", async () => {
    mockMentionedIn([SNIPPET_ROW]);
    const store = setupStore("entity-aria");
    const user = userEvent.setup();

    const fake = createFakeEditor();
    mockedGetActiveEditor.mockReturnValue(fake.editor as never);
    mockedResolveOffsetToPosition.mockReturnValue(7);
    mockedIsOffsetStillAMention.mockReturnValue(true);

    renderSection(store);
    const snippetButton = await screen.findByRole("button", {
      name: "Aria drew her own blade.",
    });

    snippetButton.focus();
    expect(snippetButton).toHaveFocus();
    await user.keyboard(" ");

    expect(fake.setTextSelection).toHaveBeenCalledWith(7);
    expect(fake.scrollIntoView).toHaveBeenCalled();
    expect(mockedApplyMentionJumpHighlight).toHaveBeenCalledTimes(1);
  });
});

/**
 * Checks that the transient jump-highlight decoration
 * (`MentionJumpHighlightExtension`'s `.mention-jump-highlight` class) is not
 * conveyed by color alone, per FR-7's reference to `docs/standards
 * /accessibility.md`.
 *
 * jsdom has no layout/paint engine (the same limitation
 * `helpers/axe.ts`'s doc comment documents for why `color-contrast` is
 * disabled there), so a computed-style assertion against a rendered node
 * cannot observe the real paint rules in a unit test. Instead, this reads
 * the actual shipped rule for `.mention-jump-highlight` out of
 * `frontend/styles/editor.css` directly and asserts it declares a non-color
 * cue (`text-decoration`) alongside its `background-color` — mirroring how
 * `.entity-highlight--needs-attention` pairs its own background with a
 * dotted underline in the same file, for the identical reason.
 *
 * MEASURED, not merely reasoned about: before this task, `editor.css` had
 * no rule at all for `.mention-jump-highlight` (confirmed via `grep` across
 * the repo), so the class rendered with no visible effect whatsoever — not
 * "color-only", but entirely unstyled. This task adds the rule itself (see
 * `editor.css`'s own doc comment above the new block) rather than only
 * writing a test that would otherwise assert against nothing.
 */
describe("a11y: mention-jump-highlight decoration is not color-only", () => {
  const editorCssPath = path.join(__dirname, "../../styles/editor.css");
  const editorCss = fs.readFileSync(editorCssPath, "utf8");

  function extractRule(css: string, selector: string): string {
    const escaped = selector.replace(/[.[\]]/g, (m) => `\\${m}`);
    const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    if (!match) {
      throw new Error(`No CSS rule found for selector: ${selector}`);
    }
    return match[1];
  }

  it(`declares a CSS rule for .${MENTION_JUMP_HIGHLIGHT_CLASS} with both a background-color and a non-color cue`, () => {
    const rule = extractRule(
      editorCss,
      `.tiptap .${MENTION_JUMP_HIGHLIGHT_CLASS}`,
    );

    expect(rule).toMatch(/background-color\s*:/);
    // A non-color visual cue — text-decoration (underline), mirroring the
    // persistent entity-highlight "needs attention" state's own
    // dotted-underline-plus-background precedent just above it in the same
    // file.
    expect(rule).toMatch(/text-decoration\s*:/);
  });

  it("the highlight token is not one of the reserved red tokens", () => {
    const rule = extractRule(
      editorCss,
      `.tiptap .${MENTION_JUMP_HIGHLIGHT_CLASS}`,
    );
    expect(rule).not.toMatch(/--color-gw-red\b/);
    expect(rule).not.toMatch(/--color-gw-red-border\b/);
  });
});
