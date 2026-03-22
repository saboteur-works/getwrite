import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import AppShell from "../components/Layout/AppShell";
import { makeStore } from "../src/store/store";
import { Provider } from "react-redux";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { createProjectFromType } from "../src/lib/models/project-creator";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readSidecar, writeSidecar } from "../src/lib/models/sidecar";
import { setFolders, setResources } from "../src/store/resourcesSlice";

describe("Reorder persistence integration", () => {
    it("persists folder.json and resource sidecar orderIndex after drag/drop", async () => {
        // create temp project on disk using scaffolder
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-test-"));
        const specPath = path.resolve(
            process.cwd(),
            "../specs/002-define-data-models/project-types/novel_project_type.json",
        );

        console.log("[test] creating project from type...");

        const created = await createProjectFromType({
            projectRoot: tmp,
            spec: specPath,
            name: "Reorder Persistence Project",
        });

        console.log("[test] created project", created.project.id);
        // Use canonical `created.resources` (not the adapter's flat `view.resources`)
        // to avoid duplicating folder entries in the UI tree (folder entries are
        // represented separately via `folders`). Passing the adapter's `view.resources`
        // would include folder placeholder entries and cause duplicate React keys
        // when combined with `folders`.
        const projectForUI = {
            ...created.project,
            folders: created.folders,
            resources: created.resources,
        } as any;

        console.log("[test] stubbing global fetch");
        // stub global fetch so AppShell's persistence call writes into our tmp project
        const originalFetch = globalThis.fetch;
        const fetchMock = vi.fn(
            async (input: RequestInfo | URL, opts?: any) => {
                const url =
                    typeof input === "string"
                        ? input
                        : input instanceof URL
                          ? input.toString()
                          : input.url;
                // parse body
                const body = opts && opts.body ? JSON.parse(opts.body) : {};
                const folderOrder = body.folderOrder ?? [];
                const resourceOrder = body.resourceOrder ?? [];

                // update folder.json files
                const foldersDir = path.join(tmp, "folders");
                const folderDirs = await fs
                    .readdir(foldersDir, { withFileTypes: true })
                    .catch(() => [] as any[]);
                for (const fo of folderOrder) {
                    for (const d of folderDirs) {
                        if (!d.isDirectory()) continue;
                        const folderJson = path.join(
                            foldersDir,
                            d.name,
                            "folder.json",
                        );
                        try {
                            const raw = await fs.readFile(folderJson, "utf8");
                            const parsed = JSON.parse(raw) as any;
                            if (parsed && parsed.id === fo.id) {
                                parsed.orderIndex = fo.orderIndex;
                                await fs.writeFile(
                                    folderJson,
                                    JSON.stringify(parsed, null, 2),
                                    "utf8",
                                );
                                break;
                            }
                        } catch (_) {
                            // ignore
                        }
                    }
                }

                // update resource sidecars by merging existing meta
                for (const ro of resourceOrder) {
                    try {
                        const existing = await readSidecar(tmp, ro.id).catch(
                            () => null,
                        );
                        const merged = {
                            ...(existing ?? {}),
                            orderIndex: ro.orderIndex,
                        };
                        await writeSidecar(tmp, ro.id, merged);
                    } catch (_e) {
                        // ignore
                    }
                }

                return { ok: true, status: 200 } as any;
            },
        );
        globalThis.fetch = fetchMock as typeof globalThis.fetch;

        console.log("[test] seeding test-local store and rendering AppShell");
        // create a test-local Redux store, seed it, and render AppShell
        const testStore = makeStore();
        testStore.dispatch(
            setProject({
                id: projectForUI.id,
                name: projectForUI.name,
                rootPath: projectForUI.rootPath ?? "",
                folders: projectForUI.folders,
                resources: projectForUI.resources,
            } as any),
        );
        testStore.dispatch(setSelectedProjectId(projectForUI.id));
        testStore.dispatch(setFolders(created.folders as any));
        testStore.dispatch(setResources(created.resources as any));

        render(
            <Provider store={testStore}>
                <AppShell
                    showSidebars={true}
                    project={projectForUI}
                    resources={projectForUI.resources}
                />
            </Provider>,
        );

        console.log("[test] AppShell rendered");

        // Expand the first folder if present and locate treeitems
        console.log("[test] waiting for Resource tree");
        const tree = await screen.findByRole("tree", {
            name: "Resource tree",
        });
        console.log("[test] found Resource tree");
        const treeItems = Array.from(
            tree.querySelectorAll('[role="treeitem"]'),
        ) as HTMLElement[];
        expect(treeItems.length).toBeGreaterThanOrEqual(2);

        // perform drag: move first item after the second
        const source = treeItems[0];
        const target = treeItems[1];

        const dataTransfer = {
            data: {} as Record<string, string>,
            setData(key: string, value: string) {
                this.data[key] = value;
            },
            getData(key: string) {
                return this.data[key];
            },
            setDragImage() {
                return undefined;
            },
        };

        await act(async () => {
            fireEvent.dragStart(source, { dataTransfer });
            fireEvent.dragOver(target, { dataTransfer });
            fireEvent.drop(target, { dataTransfer });
            await Promise.resolve();
        });

        // allow async persistence stub to complete
        console.log("[test] waiting for persistence stub to complete");
        await act(async () => {
            await new Promise((r) => setTimeout(r, 100));
        });
        console.log("[test] waiting complete");

        expect(fetchMock).toHaveBeenCalled();
        const lastCall = fetchMock.mock.calls.at(-1);
        expect(lastCall).toBeDefined();
        const requestOptions = lastCall?.[1] as { body?: string } | undefined;
        const payload = JSON.parse(requestOptions?.body ?? "{}");
        const knownFolderIds = new Set(
            created.folders.map((folder) => folder.id),
        );
        const knownResourceIds = new Set(
            created.resources.map((resource) => resource.id),
        );

        expect(Array.isArray(payload.folderOrder)).toBe(true);
        expect(Array.isArray(payload.resourceOrder)).toBe(true);
        expect(payload.folderOrder.length).toBeGreaterThan(0);
        expect(
            new Set(payload.folderOrder.map((item: { id: string }) => item.id))
                .size,
        ).toBe(payload.folderOrder.length);
        expect(
            new Set(
                payload.resourceOrder.map((item: { id: string }) => item.id),
            ).size,
        ).toBe(payload.resourceOrder.length);

        for (const item of payload.folderOrder) {
            expect(knownFolderIds.has(item.id)).toBe(true);
            expect(typeof item.orderIndex).toBe("number");
            expect(item).not.toHaveProperty("name");
            expect(item).not.toHaveProperty("path");
        }

        for (const item of payload.resourceOrder) {
            expect(knownResourceIds.has(item.id)).toBe(true);
            expect(typeof item.orderIndex).toBe("number");
            expect(item).not.toHaveProperty("name");
            expect(item).not.toHaveProperty("path");
        }

        // verify that at least one resource sidecar was updated with orderIndex
        const sampleRes = created.resources[0];
        const sidecar = await readSidecar(tmp, sampleRes.id);
        expect(sidecar).not.toBeNull();
        expect(sidecar?.id).toBe(sampleRes.id);
        expect(typeof sidecar?.id).toBe("string");
        expect(knownResourceIds.has(String(sidecar?.id ?? ""))).toBe(true);
        expect(typeof sidecar?.orderIndex === "number").toBeTruthy();

        // verify folder descriptors contain orderIndex fields
        for (const f of created.folders) {
            const folderJsonPath = path.join(
                tmp,
                "folders",
                f.slug ?? f.id,
                "folder.json",
            );
            const raw = await fs.readFile(folderJsonPath, "utf8");
            const parsed = JSON.parse(raw) as any;
            expect(typeof parsed.orderIndex).toBe("number");
        }

        // restore fetch
        globalThis.fetch = originalFetch;
    });
});
