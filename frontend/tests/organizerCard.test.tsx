import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import OrganizerCard from "../components/WorkArea/Views/OrganizerView/OrganizerCard";
import { createTextResource } from "../src/lib/models/resource";

describe("OrganizerCard", () => {
  it("renders title, type, date, body and metadata when showBody is true", () => {
    const plainText = Array.from({ length: 42 }, (_, i) => `word${i + 1}`).join(
      " ",
    );
    const res = createTextResource({
      name: "Test Resource",
      plainText,
      userMetadata: { status: "draft" },
    });

    render(
      <OrganizerCard
        resource={res}
        showBody={true}
        body="Placeholder content for Test Resource"
      />,
    );

    expect(screen.getByText("Test Resource")).toBeTruthy();
    expect(screen.getByText(/text/i)).toBeTruthy();
    expect(screen.getByText(/Words:/i)).toHaveTextContent("42");
    expect(screen.getByText(/Status:/i)).toHaveTextContent("draft");
    // body/content should be visible
    expect(
      screen.getByText(/Placeholder content for Test Resource/i),
    ).toBeTruthy();
  });

  it("hides the body when showBody is false", () => {
    const res = createTextResource({ name: "Hidden Body" });
    render(
      <OrganizerCard
        resource={res}
        showBody={false}
        body="Placeholder content for Hidden Body"
      />,
    );

    expect(screen.getByText("Hidden Body")).toBeTruthy();
    // body text should not be present
    expect(
      screen.queryByText(/Placeholder content for Hidden Body/i),
    ).toBeNull();
  });

  it("renders no body section when body is undefined", () => {
    const res = createTextResource({ name: "No Body" });
    render(<OrganizerCard resource={res} showBody={true} />);

    expect(screen.getByText("No Body")).toBeTruthy();
    expect(screen.queryByText(/No notes available/i)).toBeNull();
  });
});
