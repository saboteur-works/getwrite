import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";
import EntityKindStylesModal from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityKindStylesModal";
import type { EntityGraphKindStyleRecord } from "../../src/lib/api/entity-graph-kind-styles";

const PROJECT_ID = "entity-kind-styles-story-project";

/**
 * `EntityKindStylesModal` reads/writes through `getEntityGraphKindStyles`/
 * `saveEntityGraphKindStyle` (`lib/api/entity-graph-kind-styles.ts`), whose
 * HTTP transport calls `fetch` directly. Mocked at the `fetch` boundary,
 * mirroring `ProseDiagnosticsDetailDialog.stories.tsx`'s `mockDetailFetch` —
 * no real filesystem I/O occurs, and this codebase has no established
 * per-story mechanism for mocking a `lib/api/*` module directly (see
 * `TrashView.stories.tsx`'s doc comment).
 */
function mockKindStylesFetch(
  records: EntityGraphKindStyleRecord[],
): () => void {
  const originalFetch = globalThis.fetch;
  let saved = [...records];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (!url.includes("/api/project/entity-graph-kind-styles")) {
      throw new Error(`Unexpected fetch in story: ${url}`);
    }
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as {
        entityKind: string;
        color: string;
        shape: string;
      };
      const record: EntityGraphKindStyleRecord = {
        entityKind: body.entityKind,
        color: body.color as EntityGraphKindStyleRecord["color"],
        shape: body.shape as EntityGraphKindStyleRecord["shape"],
      };
      saved = [
        ...saved.filter(
          (existing) => existing.entityKind !== record.entityKind,
        ),
        record,
      ];
      return { ok: true, json: async () => record } as Response;
    }
    return { ok: true, json: async () => saved } as Response;
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

/** Harness toggling `isOpen` locally, mirroring `DialogHarness`'s own pattern. */
function ModalHarness({
  declaredEntityKinds,
}: {
  declaredEntityKinds: string[];
}): JSX.Element {
  const [isOpen, setIsOpen] = React.useState(true);
  return (
    <EntityKindStylesModal
      isOpen={isOpen}
      projectId={PROJECT_ID}
      declaredEntityKinds={declaredEntityKinds}
      onClose={() => setIsOpen(false)}
    />
  );
}

const meta: Meta<typeof EntityKindStylesModal> = {
  title: "WorkArea/EntityKindStylesModal",
  component: EntityKindStylesModal,
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof EntityKindStylesModal>;

/** A mix of configured and unconfigured kinds, both sections populated. */
export const MixedConfiguredAndUnmapped: Story = {
  beforeEach: () =>
    mockKindStylesFetch([
      { entityKind: "character", color: "entity-kind-0", shape: "circle" },
    ]),
  render: () => (
    <ModalHarness declaredEntityKinds={["character", "place", "faction"]} />
  ),
  play: async () => {
    const body = within(document.body);
    await waitFor(() =>
      expect(
        body.getByTestId("configured-kind-row-character"),
      ).toBeInTheDocument(),
    );
    expect(body.getByTestId("unmapped-kind-row-place")).toBeInTheDocument();
    expect(body.getByTestId("unmapped-kind-row-faction")).toBeInTheDocument();
  },
};

/** Saving a new/unmapped kind moves it into the configured list, no reload. */
export const SavingAnUnmappedKind: Story = {
  beforeEach: () => mockKindStylesFetch([]),
  render: () => <ModalHarness declaredEntityKinds={["place"]} />,
  play: async () => {
    const body = within(document.body);
    await waitFor(() =>
      expect(body.getByTestId("unmapped-kind-row-place")).toBeInTheDocument(),
    );
    fireEvent.click(body.getByRole("button", { name: /save style/i }));
    await waitFor(() =>
      expect(body.getByTestId("configured-kind-row-place")).toBeInTheDocument(),
    );
    expect(
      body.queryByTestId("unmapped-kind-row-place"),
    ).not.toBeInTheDocument();
  },
};

/** No declared entities and no configured kinds yet: both empty states render. */
export const Empty: Story = {
  beforeEach: () => mockKindStylesFetch([]),
  render: () => <ModalHarness declaredEntityKinds={[]} />,
  play: async () => {
    const body = within(document.body);
    await waitFor(() =>
      expect(
        body.getByText(/no entity kind has been customized yet/i),
      ).toBeInTheDocument(),
    );
    expect(
      body.getByText(
        /every entity kind currently in use has a configured style/i,
      ),
    ).toBeInTheDocument();
  },
};
