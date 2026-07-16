/**
 * Regression coverage for Task 9g: `ImagePickerSubmenu` must build the
 * resource file-serving URL (used both for the picker's thumbnails and for
 * the URL passed to `insertGetWriteImage`) with the tenant-scoped
 * `projectId` query param — the active project's on-disk directory
 * basename — never the legacy `projectPath` query param the hard-cutover
 * `/api/resource/[resource-id]/file` route now rejects.
 *
 * The fixture below is the same FR12 basename-vs-id shape used elsewhere
 * (e.g. `resources-api.test.ts`, `revision-transport-service.test.ts`): the
 * directory basename (`rootPath`'s trailing segment) and `project.json`'s
 * internal `id` are two independently generated UUIDs that must never be
 * conflated.
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import type { Editor } from "@tiptap/core";
import ImagePickerSubmenu from "../components/Editor/MenuBar/ImagePickerSubmenu";
import projectsReducer, {
  type StoredProject,
} from "../src/store/projectsSlice";
import resourcesReducer from "../src/store/resourcesSlice";
import type { ImageResource } from "../src/lib/models/types";

// FR12 fixture: the project's internal `id` (project.json) and its on-disk
// directory basename (the trailing segment of `rootPath`) are independently
// generated UUIDs and must never be conflated.
const PROJECT_INTERNAL_ID = "internal-id-not-a-directory-name";
const DIRECTORY_BASENAME = "aaaaaaaa-1111-4111-8111-111111111111";
const PROJECT_ROOT = `/tmp/projects/${DIRECTORY_BASENAME}`;

const IMAGE_RESOURCE: ImageResource = {
  id: "resource-1",
  slug: "resource-1",
  name: "Cover art",
  type: "image",
  file: "original.png",
  orderIndex: 0,
  createdAt: new Date().toISOString(),
};

function makeStore() {
  return configureStore({
    reducer: { projects: projectsReducer, resources: resourcesReducer },
    preloadedState: {
      projects: {
        selectedProjectId: PROJECT_INTERNAL_ID,
        projects: {
          [PROJECT_INTERNAL_ID]: {
            id: PROJECT_INTERNAL_ID,
            name: "Project",
            rootPath: PROJECT_ROOT,
            folders: [],
            resources: [],
          } as StoredProject,
        },
      },
      resources: {
        selectedResourceId: null,
        resources: [IMAGE_RESOURCE],
        folders: [],
      },
    },
  });
}

// Minimal double: ImagePickerSubmenu only calls `.chain().focus()
// .insertGetWriteImage(...).run()` on click, which this test doesn't
// exercise (it only asserts the rendered thumbnail's src).
const editorDouble = {} as unknown as Editor;

describe("ImagePickerSubmenu (T9g regression)", () => {
  it("builds the picker thumbnail src with projectId equal to the directory basename, not project.id", async () => {
    render(
      <Provider store={makeStore()}>
        <ImagePickerSubmenu editor={editorDouble} />
      </Provider>,
    );

    await userEvent.click(screen.getByLabelText("Insert image"));

    const thumb = screen.getByAltText("Cover art") as HTMLImageElement;
    expect(thumb.getAttribute("src")).toBe(
      `/api/resource/resource-1/file?projectId=${encodeURIComponent(DIRECTORY_BASENAME)}`,
    );
    expect(thumb.getAttribute("src")).not.toContain(PROJECT_INTERNAL_ID);
    expect(thumb.getAttribute("src")).not.toContain("projectPath=");
  });
});
