import React, { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "react-hot-toast";
import { X, FolderPlus } from "lucide-react";
import type { Project as CanonicalProject } from "../../src/lib/models/types";
import ProjectModalFrame from "../common/ProjectModalFrame";

export interface CreateProjectPayload {
    name: string;
    projectType: string;
}

export interface CreateProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    // onCreate receives the form payload and, when available, the persisted `Project` returned by the server
    onCreate: (
        payload: CreateProjectPayload,
        createdProject?: {
            project: CanonicalProject;
            folders: any[];
            resources: any[];
        },
    ) => void;
    defaultName?: string;
    defaultType?: CreateProjectPayload["projectType"];
}

/**
 * Controlled modal that:
 * - validates non-empty name,
 * - focuses the name input on open,
 * - emits `onCreate(payload)` and closes on success.
 *
 * Note: uses `setTimeout` to focus reliably; replace with a focus-trap for T030 if needed.
 */
export default function CreateProjectModal({
    isOpen,
    onClose,
    onCreate,
    defaultName = "",
    defaultType = "novel",
}: CreateProjectModalProps): JSX.Element | null {
    const [name, setName] = useState<string>(defaultName);
    const [projectType, setProjectType] =
        useState<CreateProjectPayload["projectType"]>(defaultType);
    const [types, setTypes] = useState<
        | {
              id: string;
              name: string;
              description?: string;
              // client-side validation error for this template (friendly message)
              validationError?: string | null;
          }[]
        | null
    >(null);
    const [loadingTypes, setLoadingTypes] = useState(false);
    const [filter, setFilter] = useState<string>("");
    const [typesError, setTypesError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const nameRef = useRef<HTMLInputElement | null>(null);

    const loadTypes = useCallback(async () => {
        setLoadingTypes(true);
        setTypesError(null);
        try {
            const res = await fetch("/api/project-types");
            if (!res.ok) {
                const body = await res.text();
                throw new Error(body || `Status ${res.status}`);
            }
            const list: any[] = await res.json();
            // Lightweight client-side validation to surface common template issues
            const processed = list.map((t) => {
                const id = t.id ?? (t.spec && t.spec.id) ?? "";
                const name =
                    t.name ?? (t.spec && t.spec.name) ?? id ?? "Unnamed";
                const description =
                    t.description ?? (t.spec && t.spec.description);
                const spec = t.spec ?? t;
                const errors: string[] = [];
                if (!id) errors.push("Template missing required field: id.");
                if (!spec || !Array.isArray(spec.folders))
                    errors.push("Template missing required field: folders.");
                else if (spec.folders.length === 0)
                    errors.push("Template must include at least one folder.");
                return {
                    id,
                    name,
                    description,
                    validationError:
                        errors.length > 0 ? errors.join(" ") : null,
                };
            });
            setTypes(processed);
            if (!defaultType && list.length > 0)
                setProjectType(processed[0].id);
        } catch (err) {
            setTypes([]);
            const msg = err instanceof Error ? err.message : String(err);
            setTypesError(msg);
            try {
                toast.error(`Failed to load project types: ${msg}`);
            } catch (_) {
                // swallow if toast lib not available in some test environments
            }
        } finally {
            setLoadingTypes(false);
        }
    }, [defaultType]);

    useEffect(() => {
        if (isOpen) {
            setName(defaultName);
            setProjectType(defaultType);
            setError(null);
            // load project types when modal opens via API
            void loadTypes();
            // focus the name input when opening
            setTimeout(() => nameRef.current?.focus(), 50);
            // basic focus trap: keep focus inside the form while modal is open
            const handleKeyDown = (ev: KeyboardEvent) => {
                if (ev.key === "Escape") {
                    onClose();
                    return;
                }
                if (ev.key === "Tab") {
                    const root = nameRef.current?.closest("form");
                    if (!root) return;
                    const focusable = Array.from(
                        root.querySelectorAll<HTMLElement>(
                            "a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex='-1'])",
                        ),
                    ).filter(Boolean);
                    if (focusable.length === 0) return;
                    const first = focusable[0];
                    const last = focusable[focusable.length - 1];
                    if (ev.shiftKey) {
                        if (document.activeElement === first) {
                            last.focus();
                            ev.preventDefault();
                        }
                    } else {
                        if (document.activeElement === last) {
                            first.focus();
                            ev.preventDefault();
                        }
                    }
                }
            };
            document.addEventListener("keydown", handleKeyDown);
            return () => document.removeEventListener("keydown", handleKeyDown);
        }
    }, [isOpen, defaultName, defaultType]);

    if (!isOpen) return null;

    const handleSubmit = async (e?: React.FormEvent) => {
        if (creating) return; // ignore duplicate submits while creating
        e?.preventDefault();
        if (!name.trim()) {
            setError("Please enter a project name.");
            nameRef.current?.focus();
            return;
        }

        const payload: CreateProjectPayload = {
            name: name.trim(),
            projectType,
        };

        setCreating(true);
        setError(null);
        try {
            const res = await fetch("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: payload.name,
                    projectType: payload.projectType,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error || `Status ${res.status}`);
            }
            const body = await res.json().catch(() => null);
            const createdProject: CanonicalProject = body?.project;
            const createdFolders = body?.folders || [];
            const createdResources = body?.resources || [];
            onCreate(payload, {
                project: createdProject,
                folders: createdFolders,
                resources: createdResources,
            });
            onClose();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
            try {
                toast.error(`Failed to create project: ${msg}`);
            } catch (_) {}
        } finally {
            setCreating(false);
        }
    };

    return (
        <ProjectModalFrame
            onClose={onClose}
            ariaLabelledBy="create-project-title"
        >
            <form
                onSubmit={handleSubmit}
                className="project-modal-panel"
                onKeyDown={(ev) => {
                    if (ev.key === "Escape") onClose();
                }}
                aria-busy={creating}
            >
                <h2 id="create-project-title" className="project-modal-title">
                    Create Project
                </h2>

                <label className="project-modal-field">
                    <div className="project-modal-label">Name</div>
                    <input
                        ref={nameRef}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="project-modal-input"
                        aria-required
                        disabled={creating}
                    />
                </label>

                <label className="project-modal-field">
                    <div className="project-modal-label">Project Type</div>
                    <div>
                        <input
                            type="search"
                            aria-label="Filter project types"
                            placeholder="Search project types..."
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="project-modal-input"
                            disabled={creating || loadingTypes}
                        />
                        <select
                            value={projectType}
                            onChange={(e) =>
                                setProjectType(e.target.value as string)
                            }
                            className="project-modal-select"
                            disabled={
                                creating ||
                                loadingTypes ||
                                (Array.isArray(types) && types.length === 0)
                            }
                        >
                            {loadingTypes ? (
                                <option>Loading...</option>
                            ) : types && types.length > 0 ? (
                                // filter by id, name, or description
                                types
                                    .filter((t) => {
                                        if (!filter) return true;
                                        const q = filter.toLowerCase();
                                        return (
                                            t.id.toLowerCase().includes(q) ||
                                            t.name.toLowerCase().includes(q) ||
                                            (t.description || "")
                                                .toLowerCase()
                                                .includes(q)
                                        );
                                    })
                                    .map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name}
                                            {t.description
                                                ? ` — ${t.description}`
                                                : ""}
                                        </option>
                                    ))
                            ) : (
                                <option value="">
                                    No project types available
                                </option>
                            )}
                        </select>
                    </div>
                    {types && types.length > 0 && (
                        <div className="project-modal-hint">
                            {
                                types.find((t) => t.id === projectType)
                                    ?.description
                            }
                        </div>
                    )}
                    {/* Show validation error for selected template (friendly messages) */}
                    {types &&
                        projectType &&
                        (() => {
                            const sel = types.find((t) => t.id === projectType);
                            if (!sel) return null;
                            if (sel.validationError)
                                return (
                                    <div className="project-modal-error">
                                        Template validation:{" "}
                                        {sel.validationError}
                                    </div>
                                );
                            return null;
                        })()}
                    {typesError && (
                        <div className="project-modal-error">
                            Failed to load project types: {typesError}
                            <button
                                type="button"
                                onClick={() => void loadTypes()}
                                className="ml-3 underline"
                            >
                                Retry
                            </button>
                        </div>
                    )}
                </label>

                {error ? (
                    <div className="project-modal-error">{error}</div>
                ) : null}

                <div className="project-modal-actions">
                    <button
                        type="button"
                        onClick={onClose}
                        className="project-modal-button project-modal-button-secondary"
                        disabled={creating}
                    >
                        <X size={14} aria-hidden="true" />
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="project-modal-button project-modal-button-primary"
                        disabled={
                            creating ||
                            (!!types &&
                                !!projectType &&
                                !!types.find(
                                    (t) =>
                                        t.id === projectType &&
                                        t.validationError,
                                ))
                        }
                    >
                        <FolderPlus size={14} aria-hidden="true" />
                        {creating ? "Creating…" : "Create"}
                    </button>
                </div>
            </form>
        </ProjectModalFrame>
    );
}
