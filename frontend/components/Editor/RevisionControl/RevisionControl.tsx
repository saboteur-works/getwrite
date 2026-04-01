import {
    ChevronDown,
    ChevronRight,
    ChevronUp,
    History,
    Save,
    Star,
    Trash2,
    View,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { shallowEqual } from "react-redux";
import { toast } from "react-hot-toast";
import useAppSelector, { useAppDispatch } from "../../../src/store/hooks";
import {
    deleteRevisionForSelectedResource,
    fetchRevisionContentForSelectedResource,
    loadRevisionsForSelectedResource,
    saveRevisionForSelectedResource,
    setCanonicalRevisionForSelectedResource,
    selectCurrentRevisionContent,
    selectCurrentRevisionId,
    selectDeletingRevisionId,
    selectFetchingRevisionId,
    selectIsLoadingRevisions,
    selectIsSavingRevision,
    selectRevisionsErrorMessage,
    selectVisibleRevisions,
} from "../../../src/store/revisionsSlice";
import { selectResource } from "../../../src/store/resourcesSlice";
export default function RevisionControl() {
    const dispatch = useAppDispatch();
    const project = useAppSelector(
        (state) =>
            state.projects.projects[state.projects.selectedProjectId || ""],
        shallowEqual,
    );
    const selectedResource = useAppSelector(
        (state) => selectResource(state.resources),
        shallowEqual,
    );

    const [isExpanded, setIsExpanded] = useState<boolean>(true);
    const [revisionName, setRevisionName] = useState<string>("");
    const [collapsedPreviewRevisionIds, setCollapsedPreviewRevisionIds] =
        useState<Record<string, boolean>>({});
    const revisionItems = useAppSelector(selectVisibleRevisions, shallowEqual);
    const isLoading = useAppSelector(selectIsLoadingRevisions);
    const isSaving = useAppSelector(selectIsSavingRevision);
    const deletingRevisionId = useAppSelector(selectDeletingRevisionId);
    const fetchingRevisionId = useAppSelector(selectFetchingRevisionId);
    const activeRevisionId = useAppSelector(selectCurrentRevisionId);
    const fetchedRevisionContent = useAppSelector(selectCurrentRevisionContent);
    const errorMessage = useAppSelector(selectRevisionsErrorMessage);

    const resolveRevisionName = useCallback(
        (revisionId: string): string => {
            const match = revisionItems.find(
                (revision) => revision.id === revisionId,
            );
            return match?.displayName ?? "Revision";
        },
        [revisionItems],
    );

    const canInteract = useMemo(() => {
        return !!project?.rootPath && !!selectedResource?.id;
    }, [project?.rootPath, selectedResource?.id]);

    useEffect(() => {
        if (!canInteract || !selectedResource?.id) {
            return;
        }

        void dispatch(
            loadRevisionsForSelectedResource({
                resourceId: selectedResource.id,
            }),
        );
    }, [canInteract, dispatch, project?.rootPath, selectedResource?.id]);

    const handleSaveRevision = async () => {
        if (
            !canInteract ||
            !revisionName.trim() ||
            !selectedResource ||
            !project
        )
            return;

        try {
            await dispatch(
                saveRevisionForSelectedResource({
                    resourceId: selectedResource.id,
                    revisionName: revisionName.trim(),
                }),
            ).unwrap();
            setRevisionName("");
        } catch {
            return;
        }
    };

    const fetchRevision = useCallback(
        async (revisionId: string) => {
            if (!project?.rootPath || !selectedResource?.id) return;

            try {
                await dispatch(
                    fetchRevisionContentForSelectedResource({
                        resourceId: selectedResource.id,
                        revisionId,
                    }),
                ).unwrap();
            } catch {
                return;
            }
        },
        [dispatch, project?.rootPath, selectedResource?.id],
    );

    const handleViewRevision = (revisionId: string) => {
        setCollapsedPreviewRevisionIds((previous) => {
            if (!previous[revisionId]) {
                return previous;
            }

            return {
                ...previous,
                [revisionId]: false,
            };
        });
        void fetchRevision(revisionId);
    };

    const toggleRevisionPreview = (revisionId: string) => {
        setCollapsedPreviewRevisionIds((previous) => ({
            ...previous,
            [revisionId]: !previous[revisionId],
        }));
    };

    const handleSetCanonical = async (revisionId: string) => {
        if (!selectedResource?.id) return;

        try {
            await dispatch(
                setCanonicalRevisionForSelectedResource({
                    resourceId: selectedResource.id,
                    revisionId,
                }),
            ).unwrap();
            await fetchRevision(revisionId);
            toast.success(`Set canonical: ${resolveRevisionName(revisionId)}`);
        } catch {
            toast.error("Failed to set canonical revision.");
            return;
        }
    };

    const handleDeleteRevision = async (revisionId: string) => {
        if (!project?.rootPath || !selectedResource?.id) return;

        try {
            await dispatch(
                deleteRevisionForSelectedResource({
                    resourceId: selectedResource.id,
                    revisionId,
                }),
            ).unwrap();
            toast.success(`Deleted: ${resolveRevisionName(revisionId)}`);
        } catch {
            toast.error("Failed to delete revision.");
            return;
        }
    };

    const handleRollbackRevision = async (revisionId: string) => {
        if (!selectedResource?.id) return;

        try {
            await dispatch(
                setCanonicalRevisionForSelectedResource({
                    resourceId: selectedResource.id,
                    revisionId,
                }),
            ).unwrap();
            await fetchRevision(revisionId);
            toast.success(`Rolled back to: ${resolveRevisionName(revisionId)}`);
        } catch {
            toast.error("Failed to roll back revision.");
            return;
        }
    };

    return (
        <section className="revision-control-root">
            <header className="revision-control-header">
                <div className="flex items-center gap-2">
                    <History
                        className="h-4 w-4"
                        style={{ color: "var(--color-gw-secondary)" }}
                    />
                    <div>
                        <h2 className="revision-control-title">
                            Revision Control
                        </h2>
                        <p className="revision-control-description">
                            Save, browse, and restore document revisions.
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setIsExpanded((current) => !current)}
                    className="revision-control-toggle"
                    aria-expanded={isExpanded}
                    aria-controls="revision-control-content"
                >
                    {isExpanded ? "Collapse" : "Expand"}
                    {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                    ) : (
                        <ChevronDown className="h-4 w-4" />
                    )}
                </button>
            </header>

            {isExpanded && (
                <div
                    id="revision-control-content"
                    className="revision-control-content"
                >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="w-full lg:w-4/12 lg:max-w-sm">
                            <h3 className="revision-control-section-heading">
                                Save Explicit Revision
                            </h3>
                            <div className="mt-2 flex items-center gap-2">
                                <input
                                    type="text"
                                    value={revisionName}
                                    onChange={(event) =>
                                        setRevisionName(event.target.value)
                                    }
                                    placeholder="Revision name"
                                    className="revision-control-input"
                                    disabled={!canInteract || isSaving}
                                />
                                <button
                                    type="button"
                                    onClick={handleSaveRevision}
                                    disabled={
                                        !canInteract ||
                                        isSaving ||
                                        !revisionName.trim().length
                                    }
                                    className="revision-control-save-button"
                                >
                                    <Save className="h-4 w-4" />
                                    Save
                                </button>
                            </div>
                        </div>

                        <div className="w-full min-w-0 lg:flex-1">
                            <h3 className="revision-control-section-heading">
                                Existing Revisions
                            </h3>

                            <div className="mt-2 revision-control-list-shell">
                                {isLoading ? (
                                    <p className="revision-control-description">
                                        Loading revisions…
                                    </p>
                                ) : revisionItems.length === 0 ? (
                                    <p className="revision-control-description">
                                        No revisions available.
                                    </p>
                                ) : (
                                    <div className="mt-2 max-h-52 w-full overflow-y-auto pr-1">
                                        <div className="flex w-full min-w-0 flex-col gap-3">
                                            {revisionItems.map((revision) => (
                                                <article
                                                    key={revision.id}
                                                    className={`revision-control-card ${
                                                        revision.isCanonical
                                                            ? "revision-control-card--canonical"
                                                            : ""
                                                    }`}
                                                >
                                                    <div className="mb-3 flex items-start justify-between gap-2">
                                                        <div>
                                                            <h4 className="revision-control-card-name">
                                                                {
                                                                    revision.displayName
                                                                }
                                                            </h4>
                                                            <p className="revision-control-card-meta">
                                                                v
                                                                {
                                                                    revision.versionNumber
                                                                }{" "}
                                                                •{" "}
                                                                {new Date(
                                                                    revision.createdAt,
                                                                ).toLocaleString()}
                                                            </p>
                                                        </div>
                                                        {revision.isCanonical && (
                                                            <span className="revision-control-badge">
                                                                Canonical
                                                            </span>
                                                        )}
                                                    </div>

                                                    {!revision.isCanonical && (
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    handleViewRevision(
                                                                        revision.id,
                                                                    )
                                                                }
                                                                disabled={
                                                                    fetchingRevisionId ===
                                                                    revision.id
                                                                }
                                                                className="revision-control-action-button"
                                                            >
                                                                <View
                                                                    className="h-3 w-3 mr-2 text-gw-secondary"
                                                                />
                                                                {fetchingRevisionId ===
                                                                revision.id
                                                                    ? "Loading..."
                                                                    : "View Revision"}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    void handleSetCanonical(
                                                                        revision.id,
                                                                    )
                                                                }
                                                                className="revision-control-action-button"
                                                            >
                                                                <Star className="h-3 w-3 mr-2 text-gw-secondary" />
                                                                Set as Canonical
                                                                Revision
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    handleDeleteRevision(
                                                                        revision.id,
                                                                    )
                                                                }
                                                                disabled={
                                                                    deletingRevisionId ===
                                                                    revision.id
                                                                }
                                                                className="revision-control-action-button revision-control-action-button--danger"
                                                            >
                                                                <Trash2
                                                                    className="h-3 w-3 mr-2 text-gw-red"
                                                                />
                                                                {deletingRevisionId ===
                                                                revision.id
                                                                    ? "Deleting..."
                                                                    : "Delete Revision"}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    void handleRollbackRevision(
                                                                        revision.id,
                                                                    )
                                                                }
                                                                className="revision-control-action-button"
                                                            >
                                                                <History
                                                                    className="h-3 w-3 mr-2 text-gw-secondary"
                                                                />
                                                                Roll Back to
                                                                Revision
                                                            </button>
                                                        </div>
                                                    )}

                                                    {fetchingRevisionId ===
                                                        revision.id && (
                                                        <p className="mt-2 revision-control-card-meta">
                                                            Loading revision…
                                                        </p>
                                                    )}

                                                    {activeRevisionId ===
                                                        revision.id &&
                                                        fetchedRevisionContent !==
                                                            null && (
                                                            <div className="mt-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        toggleRevisionPreview(
                                                                            revision.id,
                                                                        )
                                                                    }
                                                                    className="revision-control-preview-toggle"
                                                                    aria-expanded={
                                                                        !collapsedPreviewRevisionIds[
                                                                            revision
                                                                                .id
                                                                        ]
                                                                    }
                                                                >
                                                                    {collapsedPreviewRevisionIds[
                                                                        revision
                                                                            .id
                                                                    ] ? (
                                                                        <ChevronRight className="h-3 w-3" />
                                                                    ) : (
                                                                        <ChevronDown className="h-3 w-3" />
                                                                    )}
                                                                    Revision
                                                                    content
                                                                </button>

                                                                {!collapsedPreviewRevisionIds[
                                                                    revision.id
                                                                ] && (
                                                                    <div className="revision-control-preview-box">
                                                                        <p className="revision-control-preview-text">
                                                                            {
                                                                                fetchedRevisionContent
                                                                            }
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                </article>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {errorMessage && (
                                <p className="mt-2 revision-control-error">
                                    {errorMessage}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
