"use client";
import React, { useEffect, useState } from "react";
import { useAppDispatch } from "../src/store/hooks";
import {
    setProject,
    setSelectedProjectId,
    addResource,
    removeResource,
} from "../src/store/projectsSlice";
import AppShell from "../components/Layout/AppShell";
import StartPage from "../components/Start/StartPage";
import type { Resource } from "../lib/types";
import type {
    Folder,
    Project,
    AnyResource,
    ResourceBase,
} from "../src/lib/models";
import { buildProjectView } from "../src/lib/models/project-view";

/**
 * Root page component. Manages high-level state for projects and resources,
 * handles project creation/opening, and renders the main `AppShell`.
 **/
export default function Home(): JSX.Element {
    const [projects, setProjects] = useState<
        {
            id: string;
            name: string;
            rootPath: string;
            folders: Folder[];
            resources: AnyResource[];
        }[]
    >([]);
    const [selectedProject, setSelectedProject] = useState<{
        id: string;
        name: string;
        rootPath: string;
        folders: Folder[];
        resources: AnyResource[];
    } | null>(null);
    const [selectedResourceId, setSelectedResourceId] = useState<string | null>(
        null,
    );

    const dispatch = useAppDispatch();

    // Fetch existing projects on mount
    useEffect(() => {
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
                    setProjects(data);
                }
            })
            .catch((err) => {
                console.error("Error fetching projects:", err);
            });
    }, []);

    const handleCreate = (projectFiles: {
        project: Project;
        folders: any[];
        resources: any[];
    }) => {
        setProjects((prev) => [projectFiles.project, ...prev]);
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
                              metadata: r.metadata ?? {},
                              folderId: r.folderId ?? null,
                          }),
                      )
                    : [],
            }),
        );
        dispatch(setSelectedProjectId(projectFiles.project.id));
        setSelectedProject({
            id: projectFiles.project.id,
            name: projectFiles.project.name,
            rootPath: projectFiles.project.rootPath ?? "",
            folders: (projectFiles as any).folders ?? [],
            resources: (projectFiles as any).resources ?? [],
        });
    };

    /**
     * Handles the opening of a project by its projectPath
     */
    const handleOpen = async (
        /** The project's root path */
        id: string,
    ) => {
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
                              metadata: r.metadata ?? {},
                              plaintext: r.plaintext,
                          }))
                        : [],
                }),
            );

            dispatch(setSelectedProjectId(p.project.id));
            setSelectedProject({
                id: p.project.id,
                name: p.project.name,
                rootPath: p.project.rootPath ?? "",
                folders: p.folders,
                resources: p.resources,
            });
        }
    };

    const handleResourceSelect = (id: string) => {
        setSelectedResourceId(id);
    };

    /**
     * Generic updater for a resource's metadata within the selected project.
     * Applies `updater` to the matched resource and updates both `projects`
     * and `selectedProject` state immutably.
     */
    const updateResource = (
        resourceId: string,
        updater: (r: Resource) => Resource,
    ): void => {
        if (!selectedProject) return;
        setProjects((prev) =>
            prev.map((p) => {
                if (p.id !== selectedProject.id) return p;
                const resources = p.resources.map((r) =>
                    r.id === resourceId ? updater(r) : r,
                );
                return { ...p, resources, updatedAt: new Date().toISOString() };
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

    const handleChangeNotes = (text: string, resourceId: string) => {
        updateResource(resourceId, (r) => ({
            ...r,
            metadata: { ...r.metadata, notes: text },
        }));
    };

    const handleChangeStatus = (
        status: "draft" | "in-review" | "published",
        resourceId: string,
    ) => {
        updateResource(resourceId, (r) => ({
            ...r,
            metadata: { ...r.metadata, status },
        }));
    };

    const handleChangeCharacters = (chars: string[], resourceId: string) => {
        updateResource(resourceId, (r) => ({
            ...r,
            metadata: { ...r.metadata, characters: chars },
        }));
    };

    const handleChangeLocations = (locs: string[], resourceId: string) => {
        updateResource(resourceId, (r) => ({
            ...r,
            metadata: { ...r.metadata, locations: locs },
        }));
    };

    const handleChangeItems = (items: string[], resourceId: string) => {
        updateResource(resourceId, (r) => ({
            ...r,
            metadata: { ...r.metadata, items },
        }));
    };

    const handleChangePOV = (pov: string | null, resourceId: string) => {
        updateResource(resourceId, (r) => ({
            ...r,
            metadata: { ...r.metadata, pov },
        }));
    };

    const handleResourceAction = async (
        action: "create" | "copy" | "duplicate" | "delete" | "export",
        resourceId?: string,
        opts?: {
            type?: string;
            title?: string;
            folderId?: string;
        },
    ) => {
        if (!selectedProject) return;

        if (action === "create") {
            const title = opts?.title ?? "New Resource";
            const resData = {
                name: title,
                folderId: opts?.folderId ?? null,
                type: "text",
                text: {
                    plainText: "",
                    tiptap: undefined,
                },
            };

            const result = await fetch("/api/resource", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    resourceData: resData,
                    projectPath: selectedProject.rootPath,
                }),
            });
            const resBody = await result.json();
            const res: AnyResource = resBody.resource;

            // insert at end
            setProjects((prev) =>
                prev.map((p) =>
                    p.project.id === selectedProject.id
                        ? {
                              ...p,
                              resources: [...p.resources, res],
                              updatedAt: new Date().toISOString(),
                          }
                        : p,
                ),
            );
            setSelectedProject((prev) =>
                prev
                    ? {
                          ...prev,
                          resources: [...prev.resources, res],
                          updatedAt: new Date().toISOString(),
                      }
                    : prev,
            );
            setSelectedResourceId(res.id);
            // update redux store
            dispatch(
                addResource({
                    projectId: selectedProject.id,
                    resource: {
                        id: res.id,
                        metadata: res.metadata,
                        name: res.name,
                        folderId: res.folderId ?? null,
                    } as any,
                }),
            );
            return;
        }

        if (action === "copy" || action === "duplicate") {
            if (!resourceId) return;
            const src = selectedProject.resources.find(
                (r) => r.id === resourceId,
            );
            if (!src) return;
            const newTitle = `${src.title} (copy)`;
            const copy = {};
            copy.content = src.content;
            copy.metadata = { ...src.metadata };
            setProjects((prev) =>
                prev.map((p) =>
                    p.id === selectedProject.id
                        ? {
                              ...p,
                              resources: [...p.resources, copy],
                              updatedAt: new Date().toISOString(),
                          }
                        : p,
                ),
            );
            setSelectedProject((prev) =>
                prev
                    ? {
                          ...prev,
                          resources: [...prev.resources, copy],
                          updatedAt: new Date().toISOString(),
                      }
                    : prev,
            );
            setSelectedResourceId(copy.id);
            dispatch(
                addResource({
                    projectId: selectedProject.id,
                    resource: {
                        id: copy.id,
                        metadata: copy.metadata,
                        name: copy.title,
                    } as any,
                }),
            );
            return;
        }

        if (action === "delete") {
            if (!resourceId) return;
            setProjects((prev) =>
                prev.map((p) =>
                    p.id === selectedProject.id
                        ? {
                              ...p,
                              resources: p.resources.filter(
                                  (r) => r.id !== resourceId,
                              ),
                              updatedAt: new Date().toISOString(),
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
            if (selectedResourceId === resourceId) setSelectedResourceId(null);
            // update redux store
            dispatch(
                removeResource({ projectId: selectedProject.id, resourceId }),
            );
            return;
        }

        if (action === "export") {
            if (!resourceId) return;
            const r = selectedProject.resources.find(
                (x) => x.id === resourceId,
            );
            window.alert(
                `Export preview (placeholder) for: ${r?.title ?? resourceId}`,
            );
            return;
        }
    };
    return (
        <AppShell
            showSidebars={Boolean(selectedProject)}
            resources={selectedProject?.resources}
            folders={selectedProject?.folders}
            project={selectedProject as any}
            onResourceSelect={handleResourceSelect}
            onResourceAction={handleResourceAction}
            selectedResourceId={selectedResourceId}
            onChangeNotes={handleChangeNotes}
            onChangeStatus={handleChangeStatus}
            onChangeCharacters={handleChangeCharacters}
            onChangeLocations={handleChangeLocations}
            onChangeItems={handleChangeItems}
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
                    <p className="mt-4 text-slate-600">
                        Open a resource from the left-hand contents list, or
                        create a new resource to get started.
                    </p>
                </section>
            )}
        </AppShell>
    );
}
