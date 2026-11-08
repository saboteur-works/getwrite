import React from "react";
import { describe, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { runAxe } from "./helpers/axe";

vi.mock("../../src/lib/api/modules", () => ({ setModuleEnabled: vi.fn() }));

import { setModuleEnabled } from "../../src/lib/api/modules";
import ModuleSwitchSection from "../../components/Modules/ModuleSwitchSection";
import { makeStore } from "../../src/store/store";

const mockSet = vi.mocked(setModuleEnabled);

beforeEach(() => {
  mockSet.mockReset();
});

function mount() {
  return render(
    <Provider store={makeStore()}>
      <ModuleSwitchSection projectId="p1" />
    </Provider>,
  );
}

describe("a11y: ModuleSwitchSection", () => {
  it("axe passes at rest", async () => {
    const { container } = mount();
    await runAxe(container);
  });

  it("axe passes with a saved result shown", async () => {
    mockSet.mockResolvedValue({ modules: { sources: false } });
    const { container } = mount();
    await userEvent.click(screen.getByRole("checkbox", { name: /Sources/ }));
    await screen.findByText(/is now off/);
    await runAxe(container);
  });

  it("axe passes with a failure shown", async () => {
    mockSet.mockRejectedValue(new Error("Could not save."));
    const { container } = mount();
    await userEvent.click(screen.getByRole("checkbox", { name: /Sources/ }));
    await screen.findByRole("alert");
    await runAxe(container);
  });
});
