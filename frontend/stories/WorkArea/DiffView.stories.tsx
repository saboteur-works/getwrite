import React from "react";
import { diffWords } from "diff";
import { Meta, StoryObj } from "@storybook/react";
import DiffView from "../../components/WorkArea/DiffView";
import type { DiffViewProps } from "../../components/WorkArea/DiffView";
import type { RevisionEntry } from "../../src/store/revisionsSlice";

const meta: Meta<typeof DiffView> = {
    title: "WorkArea/DiffView",
    component: DiffView,
};

export default meta;

type Story = StoryObj<typeof DiffView>;

const canonicalText =
    "This is the current canonical version of the document. It has been edited and refined over time. Point A is present. Point C was added later.";

const historicalText =
    "This is the original version of the document. It was written quickly. Point A is present. Point B was here before.";

function makeRevision(
    id: string,
    displayName: string,
    versionNumber: number,
    isCanonical: boolean,
): RevisionEntry {
    return {
        id,
        resourceId: "res-1",
        versionNumber,
        createdAt: new Date(
            2026,
            0,
            versionNumber,
        ).toISOString(),
        isCanonical,
        displayName,
        filePath: `/path/v${versionNumber}/content.bin`,
        metadata: {},
    };
}

const revisions: RevisionEntry[] = [
    makeRevision("r3", "Final Draft", 3, true),
    makeRevision("r2", "Second Draft", 2, false),
    makeRevision("r1", "Initial Draft", 1, false),
];

const precomputedChunks = diffWords(canonicalText, historicalText);

export const Default: Story = {
    render: (args: DiffViewProps) => (
        <div>
            <DiffView {...args} />
            <div
                data-testid="revision-count"
                aria-hidden
                style={{ display: "none" }}
            >
                {String(args.revisions?.length ?? 0)}
            </div>
            <div
                data-testid="has-content"
                aria-hidden
                style={{ display: "none" }}
            >
                {args.canonicalContent ? "true" : "false"}
            </div>
        </div>
    ),
    args: {
        canonicalContent: canonicalText,
        selectedContent: historicalText,
        diffChunks: precomputedChunks,
        revisions,
        selectedRevisionId: "r1",
    },
};

export const Empty: Story = {
    render: (args: DiffViewProps) => (
        <div>
            <DiffView {...args} />
            <div
                data-testid="revision-count"
                aria-hidden
                style={{ display: "none" }}
            >
                {String(args.revisions?.length ?? 0)}
            </div>
            <div
                data-testid="has-content"
                aria-hidden
                style={{ display: "none" }}
            >
                {args.canonicalContent ? "true" : "false"}
            </div>
        </div>
    ),
    args: {
        canonicalContent: "",
        selectedContent: undefined,
        revisions: [],
    },
};

export const NoSelection: Story = {
    args: {
        canonicalContent: canonicalText,
        selectedContent: undefined,
        revisions,
        selectedRevisionId: null,
    },
};

export const OnlyCanonical: Story = {
    args: {
        canonicalContent: canonicalText,
        selectedContent: undefined,
        revisions: [makeRevision("r3", "Final Draft", 3, true)],
        selectedRevisionId: null,
    },
};

export const LoadingStates: Story = {
    args: {
        isLoadingCanonical: true,
        isLoadingRevisions: true,
        revisions: [],
    },
};

export const Interactive: Story = {
    render: (args: DiffViewProps) => {
        const [selectedRevisionId, setSelectedRevisionId] = React.useState<
            string | null
        >(null);
        const [selectedContent, setSelectedContent] = React.useState<
            string | undefined
        >(undefined);

        const historicalContents: Record<string, string> = {
            r1: historicalText,
            r2: "A middle draft with some changes from the original.",
        };

        const handleSelect = (id: string) => {
            setSelectedRevisionId(id);
            setSelectedContent(historicalContents[id]);
        };

        const chunks =
            args.canonicalContent && selectedContent
                ? diffWords(args.canonicalContent, selectedContent)
                : undefined;

        return (
            <div>
                <DiffView
                    {...args}
                    selectedContent={selectedContent}
                    selectedRevisionId={selectedRevisionId}
                    diffChunks={chunks}
                    onSelectRevision={handleSelect}
                />
                <div
                    data-testid="selected-revision-id"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {selectedRevisionId}
                </div>
            </div>
        );
    },
    args: {
        canonicalContent: canonicalText,
        revisions,
    },
};
