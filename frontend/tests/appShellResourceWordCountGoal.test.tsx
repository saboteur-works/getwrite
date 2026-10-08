import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";

vi.mock("../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));
vi.mock("../src/lib/api/resources", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/api/resources")>();
  return { ...actual, updateSidecar: vi.fn().mockResolvedValue(undefined) };
});

import AppShell from "../components/Layout/AppShell";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import {
  setResources,
  setSelectedResourceId,
} from "../src/store/resourcesSlice";
import { createTextResource } from "../src/lib/models/resource";
import { updateSidecar } from "../src/lib/api/resources";
import { stubAppShellFetch } from "./helpers/appShellFetchStub";

const mockUpdateSidecar = vi.mocked(updateSidecar);

// The project.json `id` deliberately differs from the directory basename in
// rootPath, mirroring the same mismatch appShellWordCountGoal.test.tsx checks
// for the project-wide goal — the sidebar's `WordCountGoalSection` resolves
// its project id via `selectActiveProjectDirectoryId` (derived from
// `rootPath`), independent of `project.id`.
const INTERNAL_ID = "7b8e0a2c-internal-id-from-project-json";
const DIRECTORY_ID = "3f5d9e11-directory-basename";

describe("AppShell resource word-count goal wiring (Task 8)", () => {
  let restoreFetch: () => void;

  beforeEach(() => {
    restoreFetch = stubAppShellFetch();
    mockUpdateSidecar.mockReset();
    mockUpdateSidecar.mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    restoreFetch();
  });

  it("drives a save through the mounted sidebar, writing the sidecar with the directory id and rendering the progress bar with the saved goal", async () => {
    const resource = createTextResource({ name: "Chapter One", plainText: "" });
    Object.assign(resource, { userMetadata: { wordCount: 1234 } });
    const rootPath = `/test/workspace/${DIRECTORY_ID}`;
    const project = {
      id: INTERNAL_ID,
      name: "Mismatched Ids Resource Goal",
      rootPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const store = makeStore();
    store.dispatch(
      setProject({
        id: INTERNAL_ID,
        name: project.name,
        rootPath,
        folders: [],
        resources: [{ id: resource.id, name: resource.name }],
      }),
    );
    store.dispatch(setSelectedProjectId(INTERNAL_ID));
    store.dispatch(setResources([resource]));
    store.dispatch(setSelectedResourceId(resource.id));

    render(
      <Provider store={store}>
        <AppShell
          showSidebars={true}
          project={project as never}
          resources={[resource]}
        />
      </Provider>,
    );

    const input = (await screen.findByLabelText(
      "word-count-goal-input",
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2000" } });

    await waitFor(() => expect(mockUpdateSidecar).toHaveBeenCalledTimes(1));
    const [resourceId, projectId, updatedResource, clearKeys] =
      mockUpdateSidecar.mock.calls[0]!;
    expect(resourceId).toBe(resource.id);
    expect(projectId).toBe(DIRECTORY_ID);
    expect(clearKeys).toBeUndefined();
    expect((updatedResource as { wordCountGoal?: number }).wordCountGoal).toBe(
      2000,
    );

    const bar = await screen.findByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemax", "2000");
    expect(bar).toHaveAttribute("aria-valuenow", "1234");
  });
});
