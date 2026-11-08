import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { runAxe } from "./helpers/axe";
import AttachmentMedia from "../../components/Sources/AttachmentMedia";
import type { AttachmentBytesView } from "../../src/lib/api/source-attachment-bytes";

const readAttachmentBytes = vi.fn();
vi.mock("../../src/lib/api/source-attachment-bytes", () => ({
  readAttachmentBytes: (...a: unknown[]) => readAttachmentBytes(...a),
}));

function view(kind: "image" | "audio"): AttachmentBytesView {
  return {
    kind,
    mime: kind === "image" ? "image/png" : "audio/mpeg",
    size: 3,
    bytes: new Uint8Array([1, 2, 3]),
  };
}

function media(name: string): JSX.Element {
  return (
    <AttachmentMedia
      projectId="p"
      resourceId="r"
      attachmentId="a"
      name={name}
    />
  );
}

beforeEach(() => {
  readAttachmentBytes.mockReset();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: () => "blob:mock",
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: () => undefined,
  });
});
afterEach(() => {
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});

describe("a11y: AttachmentMedia", () => {
  it("axe passes for an image", async () => {
    readAttachmentBytes.mockResolvedValue(view("image"));
    const { container } = render(media("photo.png"));
    await screen.findByRole("img", { name: "photo.png" });
    await runAxe(container);
  });

  it("axe passes for audio, and the native controls are not removed from the tab order", async () => {
    readAttachmentBytes.mockResolvedValue(view("audio"));
    const { container } = render(media("talk.mp3"));
    await vi.waitFor(() =>
      expect(container.querySelector("audio")).not.toBeNull(),
    );
    await runAxe(container);
    const audio = container.querySelector("audio") as HTMLAudioElement;
    expect(audio.hasAttribute("controls")).toBe(true);
    // Keyboard operation is the browser's native control; jsdom does not model
    // its focus, so the test pins that nothing removes it from the tab order.
    expect(audio.hasAttribute("tabindex")).toBe(false);
  });

  it("axe passes for a read failure", async () => {
    readAttachmentBytes.mockRejectedValue(new Error("nope"));
    const { container } = render(media("photo.png"));
    await screen.findByRole("alert");
    await runAxe(container);
  });
});
