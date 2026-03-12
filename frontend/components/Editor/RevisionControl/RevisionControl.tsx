import { ChevronDown, ChevronUp, History, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { shallowEqual } from "react-redux";
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
    const revisionItems = useAppSelector(selectVisibleRevisions, shallowEqual);
    const isLoading = useAppSelector(selectIsLoadingRevisions);
    const isSaving = useAppSelector(selectIsSavingRevision);
    const deletingRevisionId = useAppSelector(selectDeletingRevisionId);
    const fetchingRevisionId = useAppSelector(selectFetchingRevisionId);
    const activeRevisionId = useAppSelector(selectCurrentRevisionId);
    const fetchedRevisionContent = useAppSelector(selectCurrentRevisionContent);
    const errorMessage = useAppSelector(selectRevisionsErrorMessage);

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
        void fetchRevision(revisionId);
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
        } catch {
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
        } catch {
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
        } catch {
            return;
        }
    };

    return (
        <section className="border-t border-slate-200 bg-white">
            <header className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-slate-500" />
                    <div>
                        <h2 className="text-sm font-semibold text-slate-800">
                            Revision Control
                        </h2>
                        <p className="text-xs text-slate-500">
                            Save, browse, and restore document revisions.
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setIsExpanded((current) => !current)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
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
                    className="border-t border-slate-100 p-4 overflow-hidden"
                >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="w-full lg:w-4/12 lg:max-w-sm">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                                    className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
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
                                    className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md bg-slate-800 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Save className="h-4 w-4" />
                                    Save
                                </button>
                            </div>
                        </div>

                        <div className="w-full min-w-0 lg:flex-1">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Existing Revisions
                            </h3>

                            <div className="mt-2 w-full max-w-full rounded-lg border border-slate-200 bg-slate-50/50 p-3 overflow-hidden">
                                {isLoading ? (
                                    <p className="text-sm text-slate-500">
                                        Loading revisions…
                                    </p>
                                ) : revisionItems.length === 0 ? (
                                    <p className="text-sm text-slate-500">
                                        No revisions available.
                                    </p>
                                ) : (
                                    <div className="w-full max-w-full overflow-x-auto pb-1">
                                        <div className="max-h-52 overflow-y-auto pr-1">
                                            <div className="flex flex-col min-w-max gap-3">
                                                {revisionItems.map(
                                                    (revision) => (
                                                        <article
                                                            key={revision.id}
                                                            className={`w-[340px] rounded-md border p-3 shadow-sm w-full ${
                                                                revision.isCanonical
                                                                    ? "border-slate-400 bg-slate-50"
                                                                    : "border-slate-200 bg-white"
                                                            }`}
                                                        >
                                                            <div className="mb-3 flex items-start justify-between gap-2">
                                                                <div>
                                                                    <h4 className="text-sm font-semibold text-slate-800">
                                                                        {
                                                                            revision.displayName
                                                                        }
                                                                    </h4>
                                                                    <p className="text-xs text-slate-500">
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
                                                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
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
                                                                        className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                                    >
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
                                                                        className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                                                    >
                                                                        Set as
                                                                        Canonical
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
                                                                        className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                                    >
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
                                                                        className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                                                    >
                                                                        Roll
                                                                        Back to
                                                                        Revision
                                                                    </button>
                                                                </div>
                                                            )}

                                                            {fetchingRevisionId ===
                                                                revision.id && (
                                                                <p className="mt-2 text-xs text-slate-500">
                                                                    Loading
                                                                    revision…
                                                                </p>
                                                            )}

                                                            {activeRevisionId ===
                                                                revision.id &&
                                                                fetchedRevisionContent !==
                                                                    null && (
                                                                    <div className="mt-2 max-h-32 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-2">
                                                                        <p className="whitespace-pre-wrap break-words text-xs text-slate-700">
                                                                            {
                                                                                fetchedRevisionContent
                                                                            }
                                                                        </p>
                                                                    </div>
                                                                )}
                                                        </article>
                                                    ),
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {errorMessage && (
                                <p className="mt-2 text-xs text-rose-600">
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
