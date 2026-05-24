import React from "react";
import { useDispatch } from "react-redux";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
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
};

export default meta;
type Story = StoryObj<typeof EditView>;

export const Default: Story = {
  args: {
    initialContent: "<h2>Opening</h2><p>The sun sets over the harbor.</p>",
    apiKey: undefined,
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
    apiKey: undefined,
  },
};

export const Interactive: Story = {
  render: (args: EditViewProps) => {
    const [content, setContent] = React.useState(args.initialContent ?? "");
    return (
      <div>
        <EditView {...args} initialContent={content} onChange={setContent} />
        <div
          data-testid="editor-content"
          aria-hidden
          style={{ display: "none" }}
        >
          {content}
        </div>
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
