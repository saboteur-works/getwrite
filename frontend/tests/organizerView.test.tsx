import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import OrganizerView from "../components/WorkArea/Views/OrganizerView/OrganizerView";
import { createTextResource } from "../src/lib/models/resource";
import { makeStore } from "../src/store/store";
import {
  setFolders,
  setResources,
  setSelectedResourceId,
} from "../src/store/resourcesSlice";

const FOLDER_ID = "11111111-1111-4111-8111-111111111111";

const makeFolder = (
  id: string,
  name: string,
  parentId: string | null = null,
) => ({
  id,
  name,
  type: "folder" as const,
  createdAt: new Date().toISOString(),
  userMetadata: {},
  folderId: parentId,
  orderIndex: 0,
});

describe("OrganizerView", () => {
  it("shows direct children of the selected folder without requiring a click to expand", () => {
    const resources = [
      createTextResource({
        name: "R1",
        plainText: "Body R1",
        folderId: FOLDER_ID,
      } as any),
      createTextResource({
        name: "R2",
        plainText: "Body R2",
        folderId: FOLDER_ID,
      } as any),
    ];

    const folders = [makeFolder(FOLDER_ID, "Folder A")];

    const testStore = makeStore();
    testStore.dispatch(setFolders(folders as any));
    testStore.dispatch(setResources(resources as any));
    testStore.dispatch(setSelectedResourceId(FOLDER_ID));

    render(
      <Provider store={testStore}>
        <OrganizerView showBody={true} />
      </Provider>,
    );

    expect(screen.getByText("Folder A")).toBeTruthy();
    expect(screen.getByText("R1")).toBeTruthy();
    expect(screen.getByText("R2")).toBeTruthy();
  });

  it("shows empty state when no folder is selected", () => {
    const testStore = makeStore();

    render(
      <Provider store={testStore}>
        <OrganizerView showBody={true} />
      </Provider>,
    );

    expect(screen.getByText(/Select a folder/i)).toBeTruthy();
  });

  it("shows empty state when selected folder has no children", () => {
    const folders = [makeFolder(FOLDER_ID, "Empty Folder")];

    const testStore = makeStore();
    testStore.dispatch(setFolders(folders as any));
    testStore.dispatch(setSelectedResourceId(FOLDER_ID));

    render(
      <Provider store={testStore}>
        <OrganizerView showBody={true} />
      </Provider>,
    );

    expect(screen.getByText(/This folder is empty/i)).toBeTruthy();
  });

  it("calls onToggleBody when toggle button is clicked", () => {
    const folders = [makeFolder(FOLDER_ID, "Folder A")];

    const onToggle = vi.fn();
    const testStore = makeStore();
    testStore.dispatch(setFolders(folders as any));
    testStore.dispatch(setSelectedResourceId(FOLDER_ID));

    render(
      <Provider store={testStore}>
        <OrganizerView showBody={true} onToggleBody={onToggle} />
      </Provider>,
    );

    const button = screen.getByRole("button", {
      name: /Hide bodies|Show bodies/i,
    });
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalled();
  });
});
