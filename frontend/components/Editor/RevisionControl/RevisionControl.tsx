import { ChevronDown, ChevronUp, History, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { shallowEqual } from "react-redux";
import useAppSelector from "../../../src/store/hooks";
import { selectProject } from "../../../src/store/projectsSlice";
import { selectResource } from "../../../src/store/resourcesSlice";
import type { Revision } from "../../../src/lib/models/types";

interface RevisionListItem {
    id: string;
    name: string;
    versionNumber: number;
    createdAt: string;
    isCanonical: boolean;
}

function toRevisionListItems(payload: unknown): RevisionListItem[] {
    if (!payload || typeof payload !== "object") return [];

    const possibleRevisions =
        "revisions" in payload
            ? (payload as { revisions?: unknown }).revisions
            : payload;

    if (!Array.isArray(possibleRevisions)) return [];

    return possibleRevisions
        .filter((revision): revision is Revision => {
            return (
                !!revision &&
                typeof revision === "object" &&
                "id" in revision &&
                "versionNumber" in revision &&
                "createdAt" in revision &&
                "isCanonical" in revision
            );
        })
        .map((revision) => {
            const metadataName =
                revision.metadata && typeof revision.metadata === "object"
                    ? revision.metadata["name"]
                    : undefined;
            const resolvedName =
                typeof metadataName === "string" && metadataName.trim().length
                    ? metadataName.trim()
                    : `Revision v${revision.versionNumber}`;

            return {
                id: revision.id,
                name: resolvedName,
                versionNumber: revision.versionNumber,
                createdAt: revision.createdAt,
                isCanonical: revision.isCanonical,
            };
        })
        .sort((a, b) => b.versionNumber - a.versionNumber);
}

export default function RevisionControl() {
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
    const [revisionItems, setRevisionItems] = useState<RevisionListItem[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [deletingRevisionId, setDeletingRevisionId] = useState<string | null>(
        null,
    );
    const [fetchingRevisionId, setFetchingRevisionId] = useState<string | null>(
        null,
    );
    const [activeRevisionId, setActiveRevisionId] = useState<string | null>(
        null,
    );
    const [fetchedRevisionContent, setFetchedRevisionContent] = useState<
        string | null
    >(null);
    const [errorMessage, setErrorMessage] = useState<string>("");

    const canInteract = useMemo(() => {
        return !!project?.rootPath && !!selectedResource?.id;
    }, [project?.rootPath, selectedResource?.id]);

    const loadRevisions = useCallback(async () => {
        if (!project?.rootPath || !selectedResource?.id) {
            setRevisionItems([]);
            return;
        }

        setIsLoading(true);
        setErrorMessage("");

        try {
            const response = await fetch("/api/project-resources", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    projectPath: project.rootPath,
                    resourceId: selectedResource.id,
                }),
            });

            if (!response.ok) {
                throw new Error("Unable to load revisions.");
            }

            const data: unknown = await response.json();
            setRevisionItems(toRevisionListItems(data));
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "Unable to load revisions.",
            );
        } finally {
            setIsLoading(false);
        }
    }, [project?.rootPath, selectedResource?.id]);

    useEffect(() => {
        void loadRevisions();
    }, [loadRevisions]);

    const handleSaveRevision = async () => {
        if (
            !canInteract ||
            !revisionName.trim() ||
            !selectedResource ||
            !project
        )
            return;

        setIsSaving(true);
        setErrorMessage("");

        try {
            const response = await fetch(
                `/api/resource/revision/${selectedResource.id}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        projectPath: project.rootPath,
                        isCanonical: false,
                    }),
                },
            );

            if (!response.ok) {
                const errorBody = (await response.json().catch(() => ({}))) as {
                    error?: string;
                };
                throw new Error(errorBody.error ?? "Failed to save revision.");
            }

            const saved = (await response.json()) as RevisionListItem & {
                metadata?: Record<string, unknown>;
            };

            const savedItem: RevisionListItem = {
                id: saved.id,
                name: revisionName.trim(),
                versionNumber: saved.versionNumber,
                createdAt: saved.createdAt,
                isCanonical: saved.isCanonical,
            };

            setRevisionItems((current) => [savedItem, ...current]);
            setRevisionName("");
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "Failed to save revision.",
            );
        } finally {
            setIsSaving(false);
        }
    };

    const fetchRevision = useCallback(
        async (revisionId: string) => {
            if (!project?.rootPath || !selectedResource?.id) return;

            setFetchingRevisionId(revisionId);
            setErrorMessage("");

            try {
                const params = new URLSearchParams({
                    projectPath: project.rootPath,
                    revisionId,
                });

                const response = await fetch(
                    `/api/resource/revision/${selectedResource.id}?${params.toString()}`,
                );

                if (!response.ok) {
                    const errorBody = (await response
                        .json()
                        .catch(() => ({}))) as { error?: string };
                    throw new Error(
                        errorBody.error ?? "Failed to fetch revision.",
                    );
                }

                const data = (await response.json()) as {
                    revision: Revision;
                    content: string;
                };

                setActiveRevisionId(revisionId);
                setFetchedRevisionContent(data.content);
            } catch (error) {
                setErrorMessage(
                    error instanceof Error
                        ? error.message
                        : "Failed to fetch revision.",
                );
            } finally {
                setFetchingRevisionId(null);
            }
        },
        [project?.rootPath, selectedResource?.id],
    );

    const handleViewRevision = (revisionId: string) => {
        void fetchRevision(revisionId);
    };

    const handleSetCanonical = (revisionId: string) => {
        setRevisionItems((current) =>
            current.map((revision) => ({
                ...revision,
                isCanonical: revision.id === revisionId,
            })),
        );
    };

    const handleDeleteRevision = async (revisionId: string) => {
        if (!project?.rootPath || !selectedResource?.id) return;

        setDeletingRevisionId(revisionId);
        setErrorMessage("");

        try {
            const response = await fetch(
                `/api/resource/revision/${selectedResource.id}`,
                {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        projectPath: project.rootPath,
                        revisionId,
                    }),
                },
            );

            if (!response.ok) {
                const errorBody = (await response.json().catch(() => ({}))) as {
                    error?: string;
                };
                throw new Error(
                    errorBody.error ?? "Failed to delete revision.",
                );
            }

            setRevisionItems((current) =>
                current.filter((revision) => revision.id !== revisionId),
            );

            if (activeRevisionId === revisionId) {
                setActiveRevisionId(null);
            }
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "Failed to delete revision.",
            );
        } finally {
            setDeletingRevisionId(null);
        }
    };

    const handleRollbackRevision = (revisionId: string) => {
        setActiveRevisionId(revisionId);
        setRevisionItems((current) =>
            current.map((revision) => ({
                ...revision,
                isCanonical: revision.id === revisionId,
            })),
        );
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
                    className="border-t border-slate-100 p-4"
                >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="w-full lg:max-w-sm">
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

                        <div className="w-full lg:flex-1">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Existing Revisions
                            </h3>

                            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                                {isLoading ? (
                                    <p className="text-sm text-slate-500">
                                        Loading revisions…
                                    </p>
                                ) : revisionItems.length === 0 ? (
                                    <p className="text-sm text-slate-500">
                                        No revisions available.
                                    </p>
                                ) : (
                                    <div className="max-h-52 overflow-y-auto overflow-x-auto pr-1">
                                        <div className="flex min-w-max gap-3">
                                            {revisionItems.map((revision) => (
                                                <article
                                                    key={revision.id}
                                                    className={`w-[340px] rounded-md border p-3 shadow-sm ${
                                                        revision.isCanonical
                                                            ? "border-slate-400 bg-slate-50"
                                                            : "border-slate-200 bg-white"
                                                    }`}
                                                >
                                                    <div className="mb-3 flex items-start justify-between gap-2">
                                                        <div>
                                                            <h4 className="text-sm font-semibold text-slate-800">
                                                                {revision.name}
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
                                                                    handleSetCanonical(
                                                                        revision.id,
                                                                    )
                                                                }
                                                                className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                                            >
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
                                                                    handleRollbackRevision(
                                                                        revision.id,
                                                                    )
                                                                }
                                                                className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                                            >
                                                                Roll Back to
                                                                Revision
                                                            </button>
                                                        </div>
                                                    )}

                                                    {fetchingRevisionId ===
                                                        revision.id && (
                                                        <p className="mt-2 text-xs text-slate-500">
                                                            Loading revision…
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
                                            ))}
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
