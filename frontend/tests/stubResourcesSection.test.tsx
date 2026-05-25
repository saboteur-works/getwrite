import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StubResourcesSection from "../components/WorkArea/StubResourcesSection";
import type { AnyResource } from "../src/lib/models/types";

const now = new Date().toISOString();

const makeStubResource = (name: string, wordCount = 0): AnyResource =>
  ({
    id: `stub-${name}`,
    slug: name,
    name,
    type: "text",
    folderId: null,
    createdAt: now,
    updatedAt: now,
    wordCount,
    orderIndex: 0,
  }) as unknown as AnyResource;

describe("StubResourcesSection", () => {
  it("renders nothing when resources is empty", () => {
    const { container } = render(<StubResourcesSection resources={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the 'Needs content' section label", () => {
    const resources = [makeStubResource("Empty Chapter", 0)];
    render(<StubResourcesSection resources={resources} />);
    expect(screen.getByText("Needs content")).toBeDefined();
  });

  it("renders one list item per resource", () => {
    const resources = [
      makeStubResource("Chapter 1", 0),
      makeStubResource("Chapter 2", 22),
    ];
    render(<StubResourcesSection resources={resources} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders each resource's name", () => {
    const resources = [makeStubResource("My Stub Resource", 5)];
    render(<StubResourcesSection resources={resources} />);
    expect(screen.getByText("My Stub Resource")).toBeDefined();
  });
});
