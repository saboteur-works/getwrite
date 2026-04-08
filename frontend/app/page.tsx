// Last Updated: 2026-03-11

/**
 * @module Page
 *
 * Root Next.js App Router page. Owns the top-level application state:
 * the list of known projects, the currently open project, and the selected
 * resource ID.
 *
 * Responsibilities:
 * - Fetches all existing projects from `GET /api/projects` on mount.
 * - Delegates project creation to {@link StartPage} / `handleCreate`.
 * - Opens a project from disk via `POST /api/project` in `handleOpen`.
 * - Mirrors relevant state into the Redux store so downstream components
 *   (ResourceTree, AppShell, Sidebar) can react without prop-drilling.
 * - Bridges resource-level CRUD actions (create / copy / delete / export)
 *   between the UI and the REST API and Redux store.
 *
 * Renders {@link StartPage} when no project is selected, and
 * {@link AppShell} with the open project's data otherwise.
 */
"use client";
import React, { useEffect, useState } from "react";
import useAppSelector, { useAppDispatch } from "../src/store/hooks";
import {
    setProject,
    setSelectedProjectId,
    addResource,
    removeResource,
    setProjects as setProjectsInStore,
} from "../src/store/projectsSlice";
import AppShell from "../components/Layout/AppShell";
import StartPage, {
    type StartPageProjectEntry,
    type StartPageCreateResult,
} from "../components/Start/StartPage";
import type {
    Folder,
    Project,
    AnyResource,
    ResourceBase,
} from "../src/lib/models";
import type { MetadataValue } from "../src/lib/models/types";
import { buildProjectView } from "../src/lib/models/project-view";
import {
    setResources,
    setSelectedResourceId as setResourceId,
    updateResource as updateResourceInStore,
    addResource as addResourceInStore,
    setFolders,
    selectResource,
} from "../src/store/resourcesSlice";
import { shallowEqual } from "react-redux";
import { toastService } from "../src/lib/toast-service";
import { setEditorConfig } from "../src/store/editorConfigSlice";

/**
 * Flat representation of a project that has been opened in the current session.
 *
 * Distinct from {@link StartPageProjectEntry} — this is populated directly
 * from the `POST /api/project` response and contains only the fields needed
 * for in-session resource mutations (sidecar updates, CRUD actions, etc.).
 */
interface SelectedProjectState {
    /** Stable unique identifier for the project. */
    id: string;
    /** Human-readable project name shown in the editor header. */
    name: string;
    /** Absolute path to the project root directory on disk. */
    rootPath: string;
    /** All folder entries belonging to the project. */
    folders: Folder[];
    /** All resource files (text documents, etc.) belonging to the project. */
    resources: AnyResource[];
    /** Optional project-level metadata from `project.json`. */
    metadata?: Record<string, MetadataValue>;
}

/**
 * Root application page.
 *
 * Manages the top-level project and resource state, coordinates API calls for
 * project/resource lifecycle, and mirrors changes into the Redux store.
 * Renders {@link StartPage} when no project is open, and {@link AppShell}
 * once the user has opened a project.
 *
 * @returns The root application page element.
 */
export default function Home(): JSX.Element {
    /** All projects known to the app, fetched from `GET /api/projects` on mount. */
    const [projects, setProjects] = useState<StartPageProjectEntry[]>([]);

    /**
     * The project currently open in the editor, or `null` when the user is
     * on the project-selection / start screen.
     */
    const [selectedProject, setSelectedProject] =
        useState<SelectedProjectState | null>(null);

    /** ID of the resource that currently has editor focus. */
    const [selectedResourceId, setSelectedResourceId] = useState<string | null>(
        null,
    );
    const selectedResource = useAppSelector(
        (state) => selectResource(state.resources),
        shallowEqual,
    );

    const dispatch = useAppDispatch();

    // Fetch existing projects on mount
    useEffect(() => {
        /**
         * Loads all projects from the API and maps them into
         * {@link StartPageProjectEntry}-compatible view objects.
         *
         * @returns Resolved array of project view objects.
         * @throws {Error} When the HTTP response is not OK.
         */
        async function fetchProjects() {
            const res = await fetch("/api/projects", {
                method: "GET",
                headers: { "Content-Type": "application/json" },
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error || `Status ${res.status}`);
            }
            const body = await res.json().catch(() => null);
            const views = body.map((p: any) => {
                const buildView = buildProjectView({
                    project: p.project,
                    folders: p.folders,
                    resources: p.resources,
                });

                return buildView;
            });
            return views;
        }
        fetchProjects()
            .then((data) => {
                if (Array.isArray(data)) {
                    // const projectsForState = data.map((view) => {
                    //     return {
                    //         id: view.project.id,
                    //         name: view.project.name,
                    //         rootPath: view.project.rootPath,
                    //         folders: view.folders,
                    //         resources: view.resources,
                    //     };
                    // });
                    dispatch(setProjectsInStore(data));
                    setProjects(data);
                }
            })
            .catch((err) => {
                console.error("Error fetching projects:", err);
            });
    }, []);

    /**
     * Called by {@link StartPage} after a new project has been successfully
     * created on disk.
     *
     * Adds the new project to the local project list, upserts it in the Redux
     * `projects` slice, sets it as the selected project, and hydrates the
     * `resources` slice with the scaffold's initial folders and resources.
     *
     * @param projectFiles - Creation result containing the project record,
     *   initial folder list, and any scaffolded resources.
     */
    const handleCreate = (projectFiles: StartPageCreateResult) => {
        setProjects((prev) => [
            {
                project: projectFiles.project,
                folders: projectFiles.folders,
                resources: projectFiles.resources,
            },
            ...prev,
        ]);
        // persist project in redux store and mark selected
        dispatch(
            setProject({
                id: projectFiles.project.id,
                name: projectFiles.project.name,
                rootPath: projectFiles.project.rootPath ?? "",
                folders: (projectFiles as any).folders ?? [],
                resources: (projectFiles as any).resources
                    ? (projectFiles as any).resources.map(
                          (r: ResourceBase) => ({
                              id: r.id,
                              name: r.name,
                              userMetadata: r.userMetadata ?? {},
                              folderId: r.folderId ?? null,
                          }),
                      )
                    : [],
                metadata: projectFiles.project.metadata,
            }),
        );
        dispatch(setSelectedProjectId(projectFiles.project.id));
        dispatch(setResources(projectFiles.resources));
        dispatch(setFolders(projectFiles.folders));
        setSelectedProject({
            id: projectFiles.project.id,
            name: projectFiles.project.name,
            rootPath: projectFiles.project.rootPath ?? "",
            folders: (projectFiles as any).folders ?? [],
            resources: (projectFiles as any).resources ?? [],
            metadata: projectFiles.project.metadata,
        });
        toastService.success("Project created", projectFiles.project.name);
    };

    /**
     * Opens an existing project by its root path.
     *
     * Calls `POST /api/project` with the project's root path, hydrates the
     * Redux `projects` and `resources` slices with the response, and stores
     * the opened project in local `selectedProject` state so the editor shell
     * becomes visible.
     *
     * @param id - The root path of the project to open (used as the
     *   `projectPath` request body field).
     * @throws {Error} When the HTTP response is not OK.
     */
    const handleOpen = async (id: string) => {
        const res = await fetch("/api/project", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectPath: id,
            }),
        });

        if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error(body?.error || `Status ${res.status}`);
        }

        const body = await res.json().catch(() => null);
        const p = body;
        if (p) {
            // ensure project exists in redux and mark selected
            dispatch(
                setProject({
                    id: p.project.id,
                    name: p.project.name,
                    rootPath: p.project.rootPath ?? "",
                    folders: (p as any).folders ?? [],
                    resources: (p as any).resources
                        ? (p as any).resources.map((r: any) => ({
                              id: r.id,
                              name: r.name,
                              folderId: r.folderId ?? null,
                              userMetadata: r.userMetadata ?? {},
                              plaintext: r.plaintext,
                          }))
                        : [],
                    metadata: p.project.metadata,
                }),
            );
            dispatch(
                setEditorConfig({
                    headings: p.project.config.editorConfig?.headings ?? {},
                }),
            );

            dispatch(setSelectedProjectId(p.project.id));

            // Add Resources to redux store
            dispatch(setResources(p.resources));
            dispatch(setFolders(p.folders));
            setSelectedProject({
                id: p.project.id,
                name: p.project.name,
                rootPath: p.project.rootPath ?? "",
                folders: p.folders,
                resources: p.resources,
                metadata: p.project.metadata,
            });
        }
    };

    /**
     * Marks a resource as selected in both the Redux store and local state.
     *
     * Dispatches `setSelectedResourceId` so that the sidebar, editor, and other
     * resource-aware components can display the chosen resource.
     *
     * @param id - The ID of the resource to select.
     */
    const handleResourceSelect = (id: string) => {
        dispatch(setResourceId(id));
        setSelectedResourceId(id);
    };

    /**
     * Applies an immutable update to a single resource within the selected
     * project.
     *
     * The updated resource is:
     * 1. Persisted to the sidecar file via `POST /api/resource/:id/sidecar`.
     * 2. Dispatched to the Redux store via `updateResourceInStore`.
     * 3. Applied to both the `projects` list and `selectedProject` local state
     *    so the UI reflects the change immediately while the network call is
     *    in flight.
     *
     * @param resourceId - ID of the resource to update.
     * @param updater    - Pure function that receives the current resource and
     *   returns the updated version.
     */
    const updateResource = (
        resourceId: string,
        updater: (r: AnyResource) => AnyResource,
    ): void => {
        if (!selectedProject) return;
        const resource = selectedProject.resources.find(
            (r) => r.id === resourceId,
        );

        fetch(`/api/resource/${resourceId}/sidecar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectRoot: selectedProject.rootPath,
                updatedResource: updater(resource!),
            }),
        }).catch((err) => {
            console.error("Error updating resource metadata:", err);
        });

        dispatch(updateResourceInStore(updater(resource!)));

        setProjects((prev) =>
            prev.map((p) => {
                if (p.project.id !== selectedProject.id) return p;

                const resources = p.resources.map((r) =>
                    r.id === resourceId ? updater(r) : r,
                );
                return { ...p, resources };
            }),
        );

        // Also update the local selectedProject reference so UI reflects changes immediately
        setSelectedProject((prev) => {
            if (!prev || prev.id !== selectedProject.id) return prev;
            const resources = prev.resources.map((r) =>
                r.id === resourceId ? updater(r) : r,
            );
            return { ...prev, resources, updatedAt: new Date().toISOString() };
        });
    };

    /**
     * Updates the free-text notes field in a resource's metadata.
     *
     * @param text       - New notes content.
     * @param resourceId - ID of the target resource.
     */
    const handleChangeNotes = (text: string, resourceId: string) => {
        updateResource(resourceId, (r) => ({
            ...r,
            userMetadata: { ...r.userMetadata, notes: text },
        }));
    };

    /**
     * Updates the publication status in a resource's metadata.
     *
     * @param status     - The new status value (`"draft"`, `"in-review"`, or
     *   `"published"`).
     * @param resourceId - ID of the target resource.
     */
    const handleChangeStatus = (
        status: "draft" | "in-review" | "published",
        resourceId: string,
    ) => {
        console.log("Updating status to", status, "for resource", resourceId);
        updateResource(resourceId, (r) => ({
            ...r,
            userMetadata: { ...r.userMetadata, status },
        }));
    };

    /**
     * Updates the character tag list in a resource's metadata.
     *
     * @param chars      - New array of character name strings.
     * @param resourceId - ID of the target resource.
     */
    const handleChangeCharacters = (chars: string[], resourceId: string) => {
        updateResource(resourceId, (r) => ({
            ...r,
            userMetadata: { ...r.userMetadata, characters: chars },
        }));
    };

    /**
     * Updates the location tag list in a resource's metadata.
     *
     * @param locs       - New array of location name strings.
     * @param resourceId - ID of the target resource.
     */
    const handleChangeLocations = (locs: string[], resourceId: string) => {
        updateResource(resourceId, (r) => ({
            ...r,
            userMetadata: { ...r.userMetadata, locations: locs },
        }));
    };

    /**
     * Updates the items/props tag list in a resource's metadata.
     *
     * @param items      - New array of item name strings.
     * @param resourceId - ID of the target resource.
     */
    const handleChangeItems = (items: string[], resourceId: string) => {
        updateResource(resourceId, (r) => ({
            ...r,
            userMetadata: { ...r.userMetadata, items },
        }));
    };

    const handleChangeDynamicMetadata = (
        metadata: Record<string, string[]>,
        resourceId: string,
    ) => {
        updateResource(resourceId, (r) => ({
            ...r,
            userMetadata: { ...r.userMetadata, ...metadata },
        }));
    };

    /**
     * Updates the point-of-view (POV) character field in a resource's metadata.
     *
     * @param pov        - Name of the POV character, or `null` to clear it.
     * @param resourceId - ID of the target resource.
     */
    const handleChangePOV = (pov: string | null, resourceId: string) => {
        updateResource(resourceId, (r) => ({
            ...r,
            userMetadata: { ...r.userMetadata, pov },
        }));
    };

    /**
     * Dispatches a CRUD or utility action on a resource.
     *
     * Supported actions:
     * - `"create"` — POSTs a new resource to `POST /api/resource`, adds it to
     *   the Redux store, and marks it as selected.
     * - `"copy"` / `"duplicate"` — Clones the resource on disk via
     *   `POST /api/resource/:id` and appends the copy to local state.
     * - `"delete"` — Removes the resource from disk and from local + Redux state.
     * - `"export"` — Shows a placeholder export alert (not yet implemented).
     *
     * @param action     - The action to perform.
     * @param resourceId - ID of the target resource (required for all actions
     *   except `"create"`).
     * @param opts       - Additional options for the `"create"` action:
     *   - `type`     — Resource type (e.g. `"text"`, `"folder"`).
     *   - `title`    — Initial display name for the new resource.
     *   - `folderId` — ID of the parent folder, if any.
     */
    const handleResourceAction = async (
        action: "create" | "copy" | "duplicate" | "delete" | "export",
        resourceId?: string,
        opts?: {
            /** Resource type to create (e.g. `"text"` or `"folder"`). */
            type?: string;
            /** Initial display name for the new resource. */
            title?: string;
            /** Parent folder ID for the new resource. */
            folderId?: string;
        },
    ) => {
        if (!selectedProject) return;

        if (action === "create") {
            const title = opts?.title ?? "New Resource";
            let payload = {
                name: title,
                folderId: opts?.folderId ?? null,
                type: opts?.type ?? "text",
            };

            if (opts?.type === "text" || !opts?.type) {
                // `text` is not declared on the minimal payload type; cast to
                // pass the extended shape through to the API.
                (payload as any).text = {
                    plainText: "",
                    tiptap: undefined,
                };
            }

            const result = await fetch("/api/resource", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    resourceData: payload,
                    projectPath: selectedProject.rootPath,
                }),
            });
            const resBody = await result.json();
            const res: AnyResource = resBody.resource;
            dispatch(addResourceInStore(res));
            if (opts?.type === "folder") {
                console.log(res);
            } else {
                // update redux store
                dispatch(
                    // This addResource is deprecated
                    addResource({
                        projectId: selectedProject.id,
                        resource: {
                            id: res.id,
                            userMetadata: res.userMetadata,
                            name: res.name,
                            folderId: res.folderId ?? null,
                        } as any,
                    }),
                );
            }

            setSelectedResourceId(res.id);

            toastService.success(
                "Resource created",
                `${opts?.title ?? "New Resource"} created`,
            );
            return;
        }

        if (action === "copy" || action === "duplicate") {
            if (!resourceId) return;
            const src = selectedProject.resources.find(
                (r) => r.id === resourceId,
            );
            if (!src) return;
            const newTitle = `${src.name} (copy)`;
            // Shallow-clone the source resource and override its name; the
            // real duplication (new ID, disk write) is handled by the API call below.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const copy: any = { ...src, name: newTitle };

            await fetch(`/api/resource/${resourceId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "copy",
                    projectRoot: selectedProject.rootPath,
                }),
            });
            setProjects((prev) =>
                prev.map((p) =>
                    p.project.id === selectedProject.id
                        ? {
                              ...p,
                              resources: [
                                  ...p.resources,
                                  copy,
                              ] as AnyResource[],
                          }
                        : p,
                ),
            );
            setSelectedProject((prev) =>
                prev
                    ? {
                          ...prev,
                          resources: [...prev.resources, copy] as AnyResource[],
                      }
                    : prev,
            );
            setSelectedResourceId(copy.id);
            dispatch(
                addResource({
                    projectId: selectedProject.id,
                    resource: {
                        id: copy.id,
                        userMetadata: copy.userMetadata,
                        name: copy.title,
                    } as any,
                }),
            );
            toastService.success("Resource copied", `${copy.name}`);
            return;
        }

        if (action === "delete") {
            if (!resourceId) return;
            await fetch(`/api/resource/${resourceId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "delete",
                    projectRoot: selectedProject.rootPath,
                }),
            });
            setProjects((prev) =>
                prev.map((p) =>
                    p.project.id === selectedProject.id
                        ? {
                              ...p,
                              resources: p.resources.filter(
                                  (r) => r.id !== resourceId,
                              ),
                          }
                        : p,
                ),
            );
            setSelectedProject((prev) =>
                prev
                    ? {
                          ...prev,
                          resources: prev.resources.filter(
                              (r) => r.id !== resourceId,
                          ),
                          updatedAt: new Date().toISOString(),
                      }
                    : prev,
            );
            // update redux store
            dispatch(
                removeResource({ projectId: selectedProject.id, resourceId }),
            );
            const resourceName =
                selectedProject.resources.find((r) => r.id === resourceId)
                    ?.name ?? "Resource";
            toastService.success("Resource deleted", resourceName);
            return;
        }

        if (action === "export") {
            if (!resourceId) return;
            const r = selectedProject.resources.find(
                (x) => x.id === resourceId,
            );
            toastService.info(`Export preview for: ${r?.name ?? resourceId}`);
            return;
        }
    };

    const handleCloseProject = (): void => {
        setSelectedProject(null);
        setSelectedResourceId(null);
        dispatch(setSelectedProjectId(null));
        dispatch(setResourceId(null));
        dispatch(setResources([]));
        dispatch(setFolders([]));
    };

    return (
        <AppShell
            showSidebars={Boolean(selectedProject)}
            resources={selectedProject?.resources}
            folders={selectedProject?.folders}
            project={selectedProject as any}
            onResourceSelect={handleResourceSelect}
            onResourceAction={handleResourceAction}
            onCloseProject={handleCloseProject}
            selectedResourceId={selectedResource?.id ?? null}
            onChangeNotes={handleChangeNotes}
            onChangeStatus={handleChangeStatus}
            onChangeCharacters={handleChangeCharacters}
            onChangeLocations={handleChangeLocations}
            onChangeItems={handleChangeItems}
            onChangeDynamicMetadata={handleChangeDynamicMetadata}
            onChangePOV={handleChangePOV}
        >
            {!selectedProject ? (
                <StartPage
                    projects={projects}
                    onCreate={handleCreate}
                    onOpen={handleOpen}
                />
            ) : (
                <section className="p-6">
                    <h1 className="text-2xl font-semibold">
                        {selectedProject.name}
                    </h1>
                    <p className="mt-4 text-gw-secondary">
                        Open a resource from the left-hand contents list, or
                        create a new resource to get started.
                    </p>
                </section>
            )}
        </AppShell>
    );
}
