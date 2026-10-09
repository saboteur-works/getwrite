import React from "react";
import { afterEach, describe, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { runAxe } from "./helpers/axe";
import PairingScreen from "../../components/Sharing/PairingScreen";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a11y: PairingScreen", () => {
  it("has no axe violations when idle", async () => {
    const { container } = render(<PairingScreen onPaired={() => undefined} />);
    await runAxe(container);
  });

  it("has no axe violations in the error state", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ok: false, reason: "wrong" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          }),
        ),
    );
    const { container } = render(<PairingScreen onPaired={() => undefined} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Pairing code"), "123456");
    await user.click(screen.getByRole("button", { name: "Pair" }));
    await screen.findByRole("alert");
    await runAxe(container);
  });
});
