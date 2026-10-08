/**
 * axe-core checks for `SubtypesSettings` in its two story states (empty,
 * populated). Feature 72, Task 9, FR-29.
 */
import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import SubtypesSettings from "../../components/preferences/SubtypesSettings";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { runAxe } from "./helpers/axe";

function renderWith(subtypes?: string[]): HTMLElement {
  const store = makeStore();
  store.dispatch(
    setProject({ id: "p", rootPath: "/p", ...(subtypes ? { subtypes } : {}) }),
  );
  store.dispatch(setSelectedProjectId("p"));
  return render(
    <Provider store={store}>
      <main>
        <SubtypesSettings />
      </main>
    </Provider>,
  ).container;
}

describe("SubtypesSettings a11y", () => {
  it("has no violations when empty", async () => {
    await runAxe(renderWith());
  });

  it("has no violations when populated", async () => {
    await runAxe(renderWith(["Scene", "Chapter", "Act"]));
  });
});
