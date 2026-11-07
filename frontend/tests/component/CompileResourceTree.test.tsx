/**
 * Feature 102, Task 32 (FR-38): the compile outline lists a Source as a
 * selectable leaf, as it lists a text document. A new file because no
 * existing test file renders `CompileResourceTree`.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CompileResourceTree from "../../components/common/CompileResourceTree";
import type { AnyResource } from "../../src/lib/models/types";

const resources = [
  {
    id: "t1",
    slug: "scene",
    name: "Scene",
    type: "text",
    plainText: "",
    createdAt: "",
    updatedAt: "",
    userMetadata: {},
    orderIndex: 0,
  },
  {
    id: "s1",
    slug: "interview",
    name: "Interview",
    type: "source",
    plainText: "",
    createdAt: "",
    updatedAt: "",
    userMetadata: {},
    orderIndex: 1,
  },
] as AnyResource[];

describe("CompileResourceTree with a Source", () => {
  it("lists the Source by name beside the text document", () => {
    render(
      <CompileResourceTree
        resources={resources}
        checkedIds={new Set(["t1", "s1"])}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText("Scene")).toBeInTheDocument();
    expect(screen.getByText("Interview")).toBeInTheDocument();
  });

  it("shows the Source's checkbox state and reports its toggle", () => {
    const onChange = vi.fn();
    render(
      <CompileResourceTree
        resources={resources}
        checkedIds={new Set(["t1"])}
        onChange={onChange}
      />,
    );
    const box = screen.getByRole("checkbox", { name: /Interview/ });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as Set<string>;
    expect(next.has("s1")).toBe(true);
    expect(next.has("t1")).toBe(true);
  });
});
