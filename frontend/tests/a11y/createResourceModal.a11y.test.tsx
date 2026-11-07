import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CreateResourceModal from "../../components/ResourceTree/CreateResourceModal";
import { runAxe } from "./helpers/axe";

/**
 * Feature 102, Task 20 (FR-19): the create control that now offers "Source".
 * Real axe-core run over the open dialog (rendered in a portal, so the whole
 * body is scanned). `region` is disabled: a lone dialog has no page landmarks.
 */
describe("a11y: CreateResourceModal", () => {
  it("offers Source and has zero axe violations with it selected", async () => {
    render(
      <CreateResourceModal
        isOpen={true}
        initialTitle="Interview"
        initialType="source"
        parents={[]}
      />,
    );

    expect(screen.getByRole("option", { name: "Source" })).toBeInTheDocument();
    await runAxe(document.body, ["region"]);
  });
});
