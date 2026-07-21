/**
 * Regression coverage for Task 9g: `MediaView` must source the `projectId`
 * it builds the file-serving URL with from `selectActiveProjectDirectoryId`
 * (the active project's on-disk directory basename), never the legacy
 * project root path.
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
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import MediaView from "../components/WorkArea/Media/MediaView";
import projectsReducer, {
  type StoredProject,
} from "../src/store/projectsSlice";
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
    reducer: { projects: projectsReducer },
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
    },
  });
}

describe("MediaView (T9g regression)", () => {
  it("builds the image src with projectId equal to the directory basename, not project.id", () => {
    render(
      <Provider store={makeStore()}>
        <MediaView resource={IMAGE_RESOURCE} />
      </Provider>,
    );

    const img = screen.getByAltText("Cover art") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(
      `/api/resource/resource-1/file?projectId=${encodeURIComponent(DIRECTORY_BASENAME)}`,
    );
    expect(img.getAttribute("src")).not.toContain(PROJECT_INTERNAL_ID);
    expect(img.getAttribute("src")).not.toContain("projectPath=");
  });
});
