/** @vitest-environment jsdom */
/**
 * @module editorScrollContainer.test
 *
 * Tests for `components/Editor/editorScrollContainer.ts`. jsdom does no
 * layout, so the computed `overflow-y` is set inline to stand for each width.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveEditorScroller,
  resolveEditorScrollListenerRoot,
} from "../../components/Editor/editorScrollContainer";

function build(shellOverflow: string, contentOverflow: string) {
  const shell = document.createElement("div");
  shell.className = "tiptap-editor-shell";
  shell.style.overflowY = shellOverflow;
  const content = document.createElement("div");
  content.className = "tiptap-editor-content";
  content.style.overflowY = contentOverflow;
  const dom = document.createElement("div");
  content.appendChild(dom);
  shell.appendChild(content);
  document.body.appendChild(shell);
  return { shell, content, dom };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("resolveEditorScroller", () => {
  it("is the content wrapper at desktop width", () => {
    const { content, dom } = build("visible", "auto");
    expect(resolveEditorScroller(dom)).toBe(content);
  });

  it("is the shell at phone width", () => {
    const { shell, dom } = build("auto", "visible");
    expect(resolveEditorScroller(dom)).toBe(shell);
  });

  it("falls back to the content wrapper when nothing reports scrolling", () => {
    const { content, dom } = build("visible", "visible");
    expect(resolveEditorScroller(dom)).toBe(content);
  });

  it("is null outside the editor", () => {
    expect(resolveEditorScroller(document.createElement("div"))).toBeNull();
    expect(resolveEditorScroller(null)).toBeNull();
  });
});

describe("resolveEditorScrollListenerRoot", () => {
  it("is the shell when present, else the content wrapper", () => {
    const { shell, dom } = build("visible", "auto");
    expect(resolveEditorScrollListenerRoot(dom)).toBe(shell);
    const content = document.createElement("div");
    content.className = "tiptap-editor-content";
    const inner = document.createElement("div");
    content.appendChild(inner);
    expect(resolveEditorScrollListenerRoot(inner)).toBe(content);
  });
});
