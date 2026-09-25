import React from "react";
import { useDispatch } from "react-redux";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import EditView, { EditViewProps } from "../../components/WorkArea/EditView";
import {
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import { createTextResource } from "../../src/lib/models/resource";
import { setEditorConfig } from "../../src/store/editorConfigSlice";

const meta: Meta<typeof EditView> = {
  title: "WorkArea/EditView",
  component: EditView,
  // Storybook infers an implicit action for every `on*` prop and, since v8,
  // throws while rendering rather than warning: "We detected that you use an
  // implicit action arg while rendering of your story." That aborted the whole
  // story, so the editor never mounted and every spec waiting on
  // `[role="textbox"]` timed out.
  args: { onUnsavedChange: fn() },
};

export default meta;
type Story = StoryObj<typeof EditView>;

export const Default: Story = {
  args: {
    initialContent: "<h2>Opening</h2><p>The sun sets over the harbor.</p>",
  },
};

/**
 * Demonstrates wiki-style backlink decoration. Text matching `[[Target]]` in
 * the editor surface is decorated with the `.wiki-link` class so it renders
 * with link styling without altering the underlying document.
 */
export const WikiLinkStyling: Story = {
  args: {
    initialContent:
      "<p>This scene continues from [[Opening]] and references [[The Bureau]].</p>",
  },
};

export const Interactive: Story = {
  render: (args: EditViewProps) => {
    // No content probe: `EditView` exposes no content callback (only
    // `onUnsavedChange`), so the `onChange` this story used to pass was
    // ignored and the probe never updated. The spec that read it has been
    // removed; typing is covered through the real footer word count in
    // `ui-flows.e2e.spec.ts`.
    return (
      <div>
        <EditView {...args} />
      </div>
    );
  },
};

/**
 * Renders the editor in a viewport-fixed shell so its own scroll/footer-pin
 * behaviour is exercised under realistic height constraints (Storybook's
 * default decorator otherwise lets the page expand to fit content).
 *
 * Used by e2e regression tests to verify the footer stays at the bottom and
 * the toolbar stays at the top while the document content scrolls.
 */
export const TallContent: Story = {
  render: () => {
    const longParagraphs = Array.from(
      { length: 60 },
      (_unused, index) =>
        `<p>Paragraph ${index + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque pulvinar lacus eget arcu sodales, in placerat orci porta.</p>`,
    ).join("");

    return (
      <div
        data-testid="fullshell"
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          background: "var(--color-gw-editor)",
        }}
      >
        <EditView initialContent={`<h2>Long Document</h2>${longParagraphs}`} />
      </div>
    );
  },
};

interface RevisionSeedConfig {
  resourceId: string;
  canonicalId: string;
  nonCanonicalId?: string;
  selectCanonical: boolean;
}

function seedRevisionsForStory(
  dispatch: ReturnType<typeof useDispatch>,
  config: RevisionSeedConfig,
): void {
  const { resourceId, canonicalId, nonCanonicalId, selectCanonical } = config;
  const now = new Date().toISOString();
  const revisions = [
    {
      id: canonicalId,
      resourceId,
      versionNumber: 2,
      createdAt: now,
      filePath: `/tmp/${canonicalId}.json`,
      isCanonical: true,
      displayName: "Canonical",
    },
  ];
  if (nonCanonicalId) {
    revisions.push({
      id: nonCanonicalId,
      resourceId,
      versionNumber: 1,
      createdAt: now,
      filePath: `/tmp/${nonCanonicalId}.json`,
      isCanonical: false,
      displayName: "Previous",
    });
  }
  dispatch({
    type: "revisions/loadRevisionsForSelectedResource/pending",
    meta: { arg: { resourceId } },
  });
  dispatch({
    type: "revisions/loadRevisionsForSelectedResource/fulfilled",
    payload: {
      resourceId,
      revisions,
      currentRevisionId: selectCanonical
        ? canonicalId
        : (nonCanonicalId ?? canonicalId),
    },
  });
}

function StoryWithSeededRevisions({
  initialContent,
  selectCanonical,
}: {
  initialContent: string;
  selectCanonical: boolean;
}): JSX.Element {
  const dispatch = useDispatch();
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const resource = createTextResource({ name: "Draft", plainText: "seed" });
    dispatch(setResources([resource]));
    dispatch(setSelectedResourceId(resource.id));
    seedRevisionsForStory(dispatch, {
      resourceId: resource.id,
      canonicalId: "rev-canonical",
      nonCanonicalId: selectCanonical ? undefined : "rev-previous",
      selectCanonical,
    });
    setReady(true);
  }, [dispatch, selectCanonical]);

  if (!ready) return <div data-testid="seeding">Seeding…</div>;
  return <EditView initialContent={initialContent} />;
}

/**
 * Pre-seeds Redux with a selected resource whose current revision is the
 * canonical one. Used by e2e tests that exercise autosave UI transitions.
 */
export const WithCanonicalRevision: Story = {
  render: () => (
    <StoryWithSeededRevisions
      initialContent="<p>Initial draft.</p>"
      selectCanonical
    />
  ),
};

/**
 * Pre-seeds Redux with a non-canonical current revision so that the
 * "Autosave unavailable" state and "Unsaved edits" warning are reachable.
 */
export const WithNonCanonicalRevision: Story = {
  render: () => (
    <StoryWithSeededRevisions
      initialContent="<p>Initial draft.</p>"
      selectCanonical={false}
    />
  ),
};

interface SwitchableResource {
  id: string;
  name: string;
  revisionId: string;
  contentJson: string;
}

function SwitchableEditViewStory({
  resources,
  initialId,
}: {
  resources: SwitchableResource[];
  initialId: string;
}): JSX.Element {
  const dispatch = useDispatch();
  const [activeId, setActiveId] = React.useState<string>(initialId);
  const [ready, setReady] = React.useState(false);

  const loadRevisionFor = React.useCallback(
    (resource: SwitchableResource) => {
      dispatch({
        type: "revisions/loadRevisionsForSelectedResource/pending",
        meta: { arg: { resourceId: resource.id } },
      });
      dispatch({
        type: "revisions/loadRevisionsForSelectedResource/fulfilled",
        payload: {
          resourceId: resource.id,
          revisions: [
            {
              id: resource.revisionId,
              resourceId: resource.id,
              versionNumber: 1,
              createdAt: new Date().toISOString(),
              filePath: `/tmp/${resource.revisionId}.json`,
              isCanonical: true,
              displayName: "Canonical",
            },
          ],
          currentRevisionId: resource.revisionId,
        },
      });
      dispatch({
        type: "revisions/fetchRevisionContentForSelectedResource/fulfilled",
        payload: {
          resourceId: resource.id,
          revisionId: resource.revisionId,
          content: resource.contentJson,
        },
      });
    },
    [dispatch],
  );

  React.useEffect(() => {
    // Construct resources directly rather than via createTextResource so the
    // ids are stable and match the buttons / setSelectedResourceId dispatch.
    const now = new Date().toISOString();
    const seeded = resources.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.id,
      type: "text" as const,
      folderId: null,
      createdAt: now,
      plainText: "seed",
      wordCount: 1,
      charCount: 4,
      paragraphCount: 1,
      orderIndex: 0,
    }));
    dispatch(setResources(seeded));
    dispatch(setSelectedResourceId(initialId));

    const initial = resources.find((r) => r.id === initialId);
    if (initial) loadRevisionFor(initial);
    setReady(true);
  }, [dispatch, initialId, resources, loadRevisionFor]);

  const handleSwitch = (id: string) => {
    setActiveId(id);
    dispatch(setSelectedResourceId(id));
    const target = resources.find((r) => r.id === id);
    if (target) loadRevisionFor(target);
  };

  if (!ready) return <div data-testid="seeding">Seeding…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ padding: "8px", display: "flex", gap: "8px" }}>
        {resources.map((r) => (
          <button
            key={r.id}
            type="button"
            data-testid={`switch-${r.id}`}
            onClick={() => handleSwitch(r.id)}
            aria-pressed={activeId === r.id}
          >
            Open {r.name}
          </button>
        ))}
        <span data-testid="active-resource-id" aria-hidden>
          {activeId}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <EditView />
      </div>
    </div>
  );
}

const switchableResources: SwitchableResource[] = [
  {
    id: "res-alpha",
    name: "Alpha Resource",
    revisionId: "rev-alpha",
    contentJson: JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha document body." }],
        },
      ],
    }),
  },
  {
    id: "res-beta",
    name: "Beta Resource",
    revisionId: "rev-beta",
    contentJson: JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Beta document body." }],
        },
      ],
    }),
  },
];

/**
 * Seeds two text resources, each with its own canonical revision. The story
 * exposes Open buttons to switch the active resource via setSelectedResourceId
 * so e2e tests can verify the editor swaps content and header title in step
 * with the selection.
 */
export const ResourceSwitching: Story = {
  render: () => (
    <SwitchableEditViewStory
      resources={switchableResources}
      initialId="res-alpha"
    />
  ),
};

function EditorBodyConfigStory({
  fontFamily,
  fontSize,
  lineHeight,
  paragraphSpacing,
}: {
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  paragraphSpacing: string;
}): JSX.Element {
  const dispatch = useDispatch();
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    dispatch(
      setEditorConfig({
        headings: {},
        body: { fontFamily, fontSize, lineHeight, paragraphSpacing },
      }),
    );
    setReady(true);
  }, [dispatch, fontFamily, fontSize, lineHeight, paragraphSpacing]);

  if (!ready) return <div data-testid="seeding">Seeding…</div>;
  return <EditView initialContent="<p>Configured body.</p>" />;
}

/**
 * Pre-dispatches a known EditorBodyConfig into the store so e2e tests can
 * verify the configured font/line-height values propagate to the TipTap
 * editor shell as CSS variables.
 */
export const WithEditorBodyConfig: Story = {
  render: () => (
    <EditorBodyConfigStory
      fontFamily="Georgia, serif"
      fontSize="18px"
      lineHeight="2.1"
      paragraphSpacing="1.4em"
    />
  ),
};

/**
 * Provides an external rerender trigger so e2e tests can verify the caret
 * does not jump to the start of the document when an unrelated parent
 * re-render fires. Guards the regression that prompted the heading-config
 * re-init fix.
 *
 * The trigger is exposed via window.__forceEditorRerender so the test can
 * fire it without moving keyboard focus out of the editor.
 */
export const RerenderProvocateur: Story = {
  render: () => {
    const [tick, setTick] = React.useState(0);
    React.useEffect(() => {
      (
        window as unknown as { __forceEditorRerender?: () => void }
      ).__forceEditorRerender = () => setTick((value) => value + 1);
      return () => {
        delete (window as unknown as { __forceEditorRerender?: () => void })
          .__forceEditorRerender;
      };
    }, []);
    return (
      <div>
        <div
          data-testid="rerender-tick"
          aria-hidden
          style={{ display: "none" }}
        >
          {tick}
        </div>
        <EditView initialContent="<p>start </p>" />
      </div>
    );
  },
};

/**
 * The two states that exist to stop a writer losing work, neither of which had
 * a story until now — so neither was ever visually reviewed, reachable from a
 * story id in e2e, or seen by the strict-axe sweep over Storybook.
 *
 * Both turn on the same thing: `EditView` renders NO editor unless a document
 * has actually arrived. A blank editor a writer can type into is the hazard
 * (`docs/standards/failure-visibility.md`) — the first keystroke autosaves that
 * blank over content that is still on disk.
 */
function SelectedResourceEditView({
  installFetch,
}: {
  installFetch?: () => () => void;
}): JSX.Element {
  const dispatch = useDispatch();
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    const uninstall = installFetch?.();
    const resource = createTextResource({ name: "Draft", plainText: "" });
    dispatch(setResources([resource]));
    dispatch(setSelectedResourceId(resource.id));
    setIsReady(true);
    return () => {
      uninstall?.();
    };
  }, [dispatch, installFetch]);

  // The resource must be selected before `EditView` mounts: with none
  // selected there is no read at all, and the hook correctly reports "idle".
  if (!isReady) return <div data-testid="seeding">Seeding&hellip;</div>;
  return <EditView />;
}

/**
 * The read fails. `EditView` replaces the editor with an error that says the
 * content is still on disk and offers a retry — it does not merely disable the
 * editor, because a disabled editor is a promise and an absent one is a
 * guarantee.
 *
 * No mock: Storybook serves no API, so `/api/project-resources` genuinely
 * fails here. That is the real failure path rather than a simulation of one.
 */
export const LoadFailed: Story = {
  // Opted into strict axe (global default is "todo"). Both states were
  // measured clean, and they are worth holding to that: an error a writer is
  // meant to read and act on is exactly where an unlabelled or unannounced
  // control costs the most.
  parameters: { a11y: { test: "error" } },
  render: () => <SelectedResourceEditView />,
};

/**
 * The read never answers. `EditView` shows its `role="status"` placeholder and
 * no editor, because nothing is yet known about the document.
 *
 * `/api/project-resources` is held open wholesale on purpose: it serves both
 * the resource content read AND the revision list, and both are meant to be
 * outstanding here.
 */
function installNeverAnsweringRead(): () => void {
  const originalFetch = window.fetch;
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url.includes("/api/project-resources")) {
      return new Promise<Response>(() => {});
    }
    return originalFetch(input, init);
  }) as typeof window.fetch;

  // Restored on unmount, unlike the older install-once story mocks in this
  // repo: a `window.fetch` override that outlives its story leaks into every
  // story rendered after it.
  return () => {
    window.fetch = originalFetch;
  };
}

export const LoadInFlight: Story = {
  parameters: { a11y: { test: "error" } },
  render: () => (
    <SelectedResourceEditView installFetch={installNeverAnsweringRead} />
  ),
};
