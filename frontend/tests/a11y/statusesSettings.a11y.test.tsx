/**
 * axe-core checks for `StatusesSettings` in empty, populated and error states,
 * plus keyboard operability of the reorder controls and the announced error.
 * Feature 99, Task 7, FR-13.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import StatusesSettings from "../../components/preferences/StatusesSettings";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { runAxe } from "./helpers/axe";

function renderWith(statuses?: string[]): HTMLElement {
  const store = makeStore();
  store.dispatch(
    setProject({ id: "p", rootPath: "/p", ...(statuses ? { statuses } : {}) }),
  );
  store.dispatch(setSelectedProjectId("p"));
  return render(
    <Provider store={store}>
      <main>
        <StatusesSettings />
      </main>
    </Provider>,
  ).container;
}

describe("StatusesSettings a11y", () => {
  it("has no violations when empty", async () => {
    await runAxe(renderWith());
  });

  it("has no violations when populated", async () => {
    await runAxe(renderWith(["Outline", "Draft", "Final"]));
  });

  it("has no violations with a validation error, which is announced and linked to the input", async () => {
    const container = renderWith(["Outline"]);
    fireEvent.change(screen.getByLabelText(/new status/i), {
      target: { value: "outline" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Duplicate status label.");
    expect(screen.getByLabelText(/new status/i)).toHaveAttribute(
      "aria-describedby",
      alert.id,
    );
    await runAxe(container);
  });

  it("exposes labelled, native-button reorder and remove controls", () => {
    renderWith(["A", "B"]);
    for (const name of [/move a down/i, /move b up/i, /remove a/i]) {
      const button = screen.getByRole("button", { name });
      expect(button.tagName).toBe("BUTTON");
      expect(button).not.toBeDisabled();
    }
  });
});
