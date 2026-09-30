import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import OrganizerCard from "../components/WorkArea/Views/OrganizerView/OrganizerCard";
import {
  createTextResource,
  createImageResource,
  createAudioResource,
  createFolderResource,
} from "../src/lib/models/resource";

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

  describe("per-type icon (FR-1, FR-2)", () => {
    it("renders the text-resource icon and no other kind's icon", () => {
      const res = createTextResource({ name: "Text Resource" });
      const { container } = render(<OrganizerCard resource={res} />);

      expect(container.querySelector(".lucide-file-text")).toBeTruthy();
      expect(container.querySelector(".lucide-image")).toBeNull();
      expect(container.querySelector(".lucide-music")).toBeNull();
      expect(container.querySelector(".lucide-folder")).toBeNull();
    });

    it("renders the image-resource icon and no other kind's icon", () => {
      const res = createImageResource({ name: "Image Resource" });
      const { container } = render(<OrganizerCard resource={res} />);

      expect(container.querySelector(".lucide-image")).toBeTruthy();
      expect(container.querySelector(".lucide-file-text")).toBeNull();
      expect(container.querySelector(".lucide-music")).toBeNull();
      expect(container.querySelector(".lucide-folder")).toBeNull();
    });

    it("renders the audio-resource icon and no other kind's icon", () => {
      const res = createAudioResource({ name: "Audio Resource" });
      const { container } = render(<OrganizerCard resource={res} />);

      expect(container.querySelector(".lucide-music")).toBeTruthy();
      expect(container.querySelector(".lucide-file-text")).toBeNull();
      expect(container.querySelector(".lucide-image")).toBeNull();
      expect(container.querySelector(".lucide-folder")).toBeNull();
    });

    it("renders the folder icon and no other kind's icon", () => {
      const res = createFolderResource({ name: "Folder Resource" });
      const { container } = render(<OrganizerCard resource={res} />);

      expect(container.querySelector(".lucide-folder")).toBeTruthy();
      expect(container.querySelector(".lucide-file-text")).toBeNull();
      expect(container.querySelector(".lucide-image")).toBeNull();
      expect(container.querySelector(".lucide-music")).toBeNull();
    });
  });

  describe("clickable title (FR-3, FR-5, FR-6)", () => {
    it("is queryable as a real button by its accessible name", () => {
      const res = createTextResource({ name: "Clickable Title" });
      render(<OrganizerCard resource={res} onOpen={() => {}} />);

      expect(
        screen.getByRole("button", { name: "Clickable Title" }),
      ).toBeTruthy();
    });

    it("calls the same onOpen prop from both the title button and the footer Open button", () => {
      const onOpen = vi.fn();
      const res = createTextResource({ name: "Shared Handler" });
      render(<OrganizerCard resource={res} onOpen={onOpen} />);

      screen.getByRole("button", { name: "Shared Handler" }).click();
      expect(onOpen).toHaveBeenCalledTimes(1);

      screen.getByRole("button", { name: "Open" }).click();
      expect(onOpen).toHaveBeenCalledTimes(2);
    });
  });
});
