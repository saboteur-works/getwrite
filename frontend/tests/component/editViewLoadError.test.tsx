import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";

const fetchResourceContent = vi.fn();
const fetchRevisionContent = vi.fn();

vi.mock("../../src/lib/api/resources", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/api/resources")
  >("../../src/lib/api/resources");
  return {
    ...actual,
    fetchResourceContent: (...args: unknown[]) => fetchResourceContent(...args),
    fetchRevisionContent: (...args: unknown[]) => fetchRevisionContent(...args),
  };
});

vi.mock("../../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <div data-testid="tiptap-mock" />,
}));

import EditView from "../../components/WorkArea/EditView";
import { makeStore } from "../../src/store/store";
import {
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { createTextResource } from "../../src/lib/models/resource";

/**
 * A failed content read must not look like an empty document. Before this, the
 * editor rendered blank with no error and no retry, and the first keystroke
 * autosaved that blank over content that was intact on disk.
 */
describe("EditView — content that fails to load", () => {
  function renderEditView() {
    const store = makeStore();
    const resource = createTextResource({
      name: "Scene",
      plainText: "words on disk",
    });
    store.dispatch(
      setProject({
        id: "project-1",
        name: "Project",
        rootPath: "/tmp/project",
        resources: [{ id: resource.id, name: resource.name }],
      }),
    );
    store.dispatch(setSelectedProjectId("project-1"));
    store.dispatch(setResources([resource]));
    store.dispatch(setSelectedResourceId(resource.id));
    return render(
      <Provider store={store}>
        <EditView />
      </Provider>,
    );
  }

  beforeEach(() => vi.clearAllMocks());

  it("shows an error instead of the editor, so there is nothing to type into", async () => {
    fetchResourceContent.mockResolvedValue(null);
    renderEditView();

    const alert = await screen.findByTestId("editview-load-error");
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert).toHaveTextContent(/could not be loaded/i);
    // The editor itself is absent, not merely disabled.
    expect(screen.queryByTestId("tiptap-mock")).toBeNull();
  });

  it("reassures the writer their content is untouched", async () => {
    fetchResourceContent.mockResolvedValue(null);
    renderEditView();

    const alert = await screen.findByTestId("editview-load-error");
    expect(alert).toHaveTextContent(/still on disk/i);
  });

  it("restores the editor when a retry succeeds", async () => {
    fetchResourceContent.mockResolvedValueOnce(null);
    renderEditView();
    await screen.findByTestId("editview-load-error");

    fetchResourceContent.mockResolvedValue({
      resourceContent: { plaintextContent: "words on disk" },
      revisions: [],
    });
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() =>
      expect(screen.queryByTestId("editview-load-error")).toBeNull(),
    );
    expect(screen.getByTestId("tiptap-mock")).toBeTruthy();
  });

  it("renders the editor normally when the read succeeds", async () => {
    fetchResourceContent.mockResolvedValue({
      resourceContent: { plaintextContent: "words on disk" },
      revisions: [],
    });
    renderEditView();

    await waitFor(() => expect(screen.getByTestId("tiptap-mock")).toBeTruthy());
    expect(screen.queryByTestId("editview-load-error")).toBeNull();
  });
});
