/** @vitest-environment jsdom */
/**
 * Feature 101, Task 16 (FR-15, FR-22): annotation read state and explicit
 * (non-optimistic) writes.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import { useAnnotations } from "../../src/hooks/useAnnotations";
import * as client from "../../src/lib/api/annotations";
import * as revisionTransport from "../../src/store/revision-transport-service";
import { ProjectLockedError } from "../../src/lib/models/locked-access";
import type { Annotation } from "../../src/lib/models";

vi.mock("../../src/lib/api/annotations");
vi.mock("../../src/store/revision-transport-service");

const A: Annotation = {
  id: "a",
  body: "one",
  quote: "hello",
  createdAt: "t",
  updatedAt: "t",
};

const editors: Editor[] = [];

function makeEditor(): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: baseSchemaExtensions,
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "hello world" }] },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

describe("useAnnotations", () => {
  it("is loading, then ok with the list", async () => {
    vi.mocked(client.listAnnotations).mockResolvedValue([A]);
    const { result } = renderHook(() => useAnnotations("p", "r", null));
    expect(result.current.state.status).toBe("loading");
    await waitFor(() => expect(result.current.state.status).toBe("ok"));
    expect(result.current.state).toEqual({ status: "ok", annotations: [A] });
  });

  it("a failed read is `failed`, never an empty list; retry re-reads", async () => {
    vi.mocked(client.listAnnotations)
      .mockRejectedValueOnce(new Error("read broke"))
      .mockResolvedValueOnce([]);
    const { result } = renderHook(() => useAnnotations("p", "r", null));
    await waitFor(() => expect(result.current.state.status).toBe("failed"));
    expect(result.current.state).toEqual({
      status: "failed",
      message: "read broke",
    });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe("ok"));
    expect(result.current.state).toEqual({ status: "ok", annotations: [] });
  });

  it("rethrows a locked-access error during render", async () => {
    vi.mocked(client.listAnnotations).mockRejectedValue(
      new ProjectLockedError("p"),
    );
    const { result } = renderHook(() => {
      try {
        return useAnnotations("p", "r", null);
      } catch (error) {
        return error;
      }
    });
    await waitFor(() =>
      expect(result.current).toBeInstanceOf(ProjectLockedError),
    );
  });

  it("adds explicitly: the list gains the annotation only after the write succeeds", async () => {
    vi.mocked(client.listAnnotations).mockResolvedValue([]);
    let release: (a: Annotation) => void = () => undefined;
    vi.mocked(client.addAnnotation).mockImplementation(
      () => new Promise<Annotation>((resolve) => (release = resolve)),
    );
    const editor = makeEditor();
    const { result } = renderHook(() => useAnnotations("p", "r", editor));
    await waitFor(() => expect(result.current.state.status).toBe("ok"));
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.add("one", { from: 1, to: 6 });
    });
    expect(result.current.state).toEqual({ status: "ok", annotations: [] });
    await act(async () => {
      release({ ...A });
      await pending;
    });
    expect(result.current.state).toEqual({ status: "ok", annotations: [A] });
  });

  it("a failed add leaves the list unchanged and reports the message", async () => {
    vi.mocked(client.listAnnotations).mockResolvedValue([A]);
    vi.mocked(client.addAnnotation).mockRejectedValue(new Error("nope"));
    const editor = makeEditor();
    const { result } = renderHook(() => useAnnotations("p", "r", editor));
    await waitFor(() => expect(result.current.state.status).toBe("ok"));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.add("two", { from: 1, to: 6 });
    });
    expect(outcome).toMatchObject({
      ok: false,
      stage: "write",
      message: "nope",
    });
    expect(result.current.state).toEqual({ status: "ok", annotations: [A] });
  });

  it("an add whose mark step failed keeps the stored annotation listed (detached)", async () => {
    vi.mocked(client.listAnnotations).mockResolvedValue([]);
    vi.mocked(client.addAnnotation).mockResolvedValue({ ...A, id: "n" });
    const editor = makeEditor();
    // The text at the range is not the quote, so the mark step refuses.
    const { result } = renderHook(() => useAnnotations("p", "r", editor));
    await waitFor(() => expect(result.current.state.status).toBe("ok"));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.add("one", { from: 1, to: 6 });
      editor.destroy();
    });
    expect(outcome).toBeDefined();
    expect(result.current.state).toMatchObject({
      status: "ok",
      annotations: [{ id: "n" }],
    });
  });

  it("update replaces the stored annotation only on success", async () => {
    vi.mocked(client.listAnnotations).mockResolvedValue([A]);
    vi.mocked(client.updateAnnotation)
      .mockRejectedValueOnce(new Error("bad"))
      .mockResolvedValueOnce({ ...A, body: "edited", updatedAt: "u" });
    const { result } = renderHook(() => useAnnotations("p", "r", null));
    await waitFor(() => expect(result.current.state.status).toBe("ok"));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.update("a", "edited");
    });
    expect(outcome).toEqual({ ok: false, message: "bad" });
    expect(result.current.state).toEqual({ status: "ok", annotations: [A] });
    await act(async () => {
      outcome = await result.current.update("a", "edited");
    });
    expect(outcome).toEqual({ ok: true });
    expect(result.current.state).toMatchObject({
      annotations: [{ id: "a", body: "edited" }],
    });
  });

  it("remove drops the annotation once the body is gone, even if the mark step failed", async () => {
    vi.mocked(client.listAnnotations).mockResolvedValue([A]);
    vi.mocked(client.deleteAnnotation).mockResolvedValue(undefined);
    const editor = makeEditor();
    const { result } = renderHook(() => useAnnotations("p", "r", editor));
    await waitFor(() => expect(result.current.state.status).toBe("ok"));
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.commands.setMark("annotation", { id: "a" });
    vi.spyOn(editor.view, "dispatch").mockImplementation(() => {
      throw new Error("view gone");
    });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.remove("a");
    });
    expect(outcome).toEqual({ ok: false, stage: "mark", message: "view gone" });
    expect(result.current.state).toEqual({ status: "ok", annotations: [] });
  });

  it("a failed remove keeps the annotation listed and reports the stage", async () => {
    vi.mocked(client.listAnnotations).mockResolvedValue([A]);
    vi.mocked(client.deleteAnnotation).mockRejectedValue(new Error("locked"));
    const editor = makeEditor();
    const { result } = renderHook(() => useAnnotations("p", "r", editor));
    await waitFor(() => expect(result.current.state.status).toBe("ok"));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.remove("a");
    });
    expect(outcome).toEqual({ ok: false, stage: "body", message: "locked" });
    expect(result.current.state).toEqual({ status: "ok", annotations: [A] });
  });

  it("no flow touches the revision transport (no revision is created)", async () => {
    vi.mocked(client.listAnnotations).mockResolvedValue([A]);
    vi.mocked(client.addAnnotation).mockResolvedValue({ ...A, id: "n" });
    vi.mocked(client.updateAnnotation).mockResolvedValue(A);
    vi.mocked(client.deleteAnnotation).mockResolvedValue(undefined);
    const editor = makeEditor();
    const { result } = renderHook(() => useAnnotations("p", "r", editor));
    await waitFor(() => expect(result.current.state.status).toBe("ok"));
    await act(async () => {
      await result.current.add("x", { from: 1, to: 6 });
      await result.current.update("a", "y");
      await result.current.remove("a");
    });
    const fns = Object.values(revisionTransport).filter(
      (v) => typeof v === "function",
    );
    expect(fns.length).toBeGreaterThan(0);
    for (const fn of fns) expect(fn).not.toHaveBeenCalled();
  });
});
