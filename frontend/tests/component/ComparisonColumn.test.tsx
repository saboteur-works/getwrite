/** @vitest-environment jsdom */
/**
 * Feature 110, Task 17 (FR-12, FR-15, FR-16, FR-22): one comparison column in
 * each of the text, no-text, audio-only and unreadable states.
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ComparisonColumn, {
  type ComparisonColumnProps,
} from "../../components/Folklore/ComparisonColumn";
import type { VariantFieldDescription } from "../../src/lib/models/folklore-variant-fields";
import { runAxe } from "../a11y/helpers/axe";

const mediaMounts = vi.fn();
vi.mock("../../components/Sources/AttachmentMedia", () => ({
  default: (props: { attachmentId: string; name: string }) => {
    mediaMounts(props);
    return <p role="status">{`player ${props.name}`}</p>;
  },
}));

const FIELDS: VariantFieldDescription[] = [
  {
    key: "teller",
    label: "Teller",
    kind: "detail",
    state: "set",
    text: "Anna",
  },
  { key: "place", label: "Place", kind: "detail", state: "not-set" },
  {
    key: "motifs",
    label: "Motifs",
    kind: "tags",
    state: "set",
    tags: [
      { text: "river", isInList: true, mark: null },
      { text: "mill", isInList: false, mark: "not in the list" },
    ],
  },
  { key: "date", label: "Date", kind: "detail", state: "unexpected-value" },
];

const DOC = JSON.stringify({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Once upon a river." }],
    },
  ],
});

function props(
  over: Partial<ComparisonColumnProps> = {},
): ComparisonColumnProps {
  return {
    projectId: "p1",
    resourceId: "r1",
    name: "Version A",
    fields: FIELDS,
    content: { kind: "text", text: DOC },
    audio: { kind: "none" },
    ...over,
  };
}

beforeEach(() => mediaMounts.mockClear());

describe("ComparisonColumn", () => {
  it("is a section labelled by an h3 with the variant name", () => {
    render(<ComparisonColumn {...props()} />);
    const section = screen.getByRole("region", { name: "Version A" });
    expect(section.tagName).toBe("SECTION");
    expect(
      within(section).getByRole("heading", { level: 3, name: "Version A" }),
    ).toBeTruthy();
  });

  it("shows fields above the text, with not set and not in the list in text", () => {
    const { container } = render(<ComparisonColumn {...props()} />);
    expect(screen.getByText("Teller")).toBeTruthy();
    expect(screen.getByText("Anna")).toBeTruthy();
    expect(screen.getByText("not set")).toBeTruthy();
    expect(screen.getByText(/mill/).textContent).toContain("not in the list");
    expect(screen.getByText("river").textContent).not.toContain(
      "not in the list",
    );
    expect(screen.getByText(/unexpected/i)).toBeTruthy();
    const fields = container.querySelector("dl") as HTMLElement;
    const body = screen.getByTestId("comparison-column-body");
    expect(
      fields.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("gives the scroll body tabindex 0 and an accessible name", () => {
    render(<ComparisonColumn {...props()} />);
    const body = screen.getByRole("region", { name: "Text of Version A" });
    expect(body.getAttribute("tabindex")).toBe("0");
  });

  it("shows text through the stored renderer and mounts no player", () => {
    render(<ComparisonColumn {...props()} />);
    expect(screen.getByText("Once upon a river.")).toBeTruthy();
    expect(mediaMounts).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /play/i })).toBeNull();
  });

  it("shows non-JSON text as plain text", () => {
    render(
      <ComparisonColumn
        {...props({ content: { kind: "text", text: "Plain <b>words</b>" } })}
      />,
    );
    expect(screen.getByText("Plain <b>words</b>")).toBeTruthy();
  });

  it("shows a no text line and fields when there is no audio", () => {
    render(<ComparisonColumn {...props({ content: { kind: "none" } })} />);
    expect(screen.getByText("No text")).toBeTruthy();
    expect(screen.getByText("Anna")).toBeTruthy();
    expect(mediaMounts).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /play/i })).toBeNull();
  });

  it("mounts the player only after the writer asks to play", async () => {
    render(
      <ComparisonColumn
        {...props({
          content: { kind: "none" },
          audio: {
            kind: "available",
            attachments: [{ id: "a1", name: "telling.wav" }],
          },
        })}
      />,
    );
    expect(screen.getByText("No text")).toBeTruthy();
    expect(mediaMounts).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Play audio: telling.wav" }),
    );
    expect(mediaMounts).toHaveBeenCalled();
    expect(mediaMounts.mock.calls[0][0]).toMatchObject({
      projectId: "p1",
      resourceId: "r1",
      attachmentId: "a1",
      name: "telling.wav",
    });
    expect(screen.getByText("player telling.wav")).toBeTruthy();
  });

  it("shows an unreadable variant with its reason and not an empty column", () => {
    render(
      <ComparisonColumn
        {...props({ content: { kind: "unreadable", reason: "File missing." } })}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("File missing.");
    expect(screen.queryByText("No text")).toBeNull();
  });

  it("shows a failed attachment list read as a failure, not as no audio", () => {
    render(
      <ComparisonColumn
        {...props({
          content: { kind: "none" },
          audio: { kind: "failed", reason: "Attachments could not be listed." },
        })}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Attachments could not be listed.",
    );
  });

  it("shows a locked project as locked, never as no text", () => {
    render(<ComparisonColumn {...props({ content: { kind: "locked" } })} />);
    expect(screen.getByText(/locked/i)).toBeTruthy();
    expect(screen.queryByText("No text")).toBeNull();
  });

  it("passes axe in the text, audio-only and unreadable states", async () => {
    const states: Partial<ComparisonColumnProps>[] = [
      {},
      {
        content: { kind: "none" },
        audio: {
          kind: "available",
          attachments: [{ id: "a1", name: "t.wav" }],
        },
      },
      { content: { kind: "unreadable", reason: "File missing." } },
    ];
    for (const s of states) {
      const { container, unmount } = render(<ComparisonColumn {...props(s)} />);
      await runAxe(container, ["region"]);
      unmount();
    }
  });
});
