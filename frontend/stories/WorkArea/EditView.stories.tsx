import React from "react";
import { useDispatch } from "react-redux";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import EditView, { EditViewProps } from "../../components/WorkArea/EditView";
import {
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import { createTextResource } from "../../src/lib/models/resource";

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
