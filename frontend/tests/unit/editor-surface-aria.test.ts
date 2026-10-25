/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import {
  SPELLCHECK_ENABLED_STORAGE_KEY,
  resetSpellcheckSessionValue,
} from "../../src/lib/spellcheck-preference";
import { EDITOR_SURFACE_ATTRIBUTES } from "../../components/TipTapEditor";

/**
 * The editing surface is the single most important control in the app, and it
 * was invisible to the accessibility tree: `.ProseMirror` is a bare
 * `contenteditable="true"` div, which carries no implicit role. Screen readers
 * could not announce it as an editable field, and role-based automation had to
 * fall back to a CSS selector.
 *
 * TipTap hands these attributes straight to the ProseMirror view, and the
 * component renders a simplified mock under test (so the real view never
 * mounts here) — asserting the contract is therefore asserting the rendered
 * attributes.
 */
describe("TipTap editing surface accessibility attributes", () => {
  it("exposes the editing surface as a multiline textbox", () => {
    expect(EDITOR_SURFACE_ATTRIBUTES.role).toBe("textbox");
    expect(EDITOR_SURFACE_ATTRIBUTES["aria-multiline"]).toBe("true");
  });

  it("gives the surface an accessible name", () => {
    // Without a name, a role-based query can find the field but nothing can
    // distinguish it from any other textbox on the page.
    expect(EDITOR_SURFACE_ATTRIBUTES["aria-label"]).toBeTruthy();
  });

  it("keeps the styling classes the editor layout depends on", () => {
    // The attributes object is also where the surface's sizing lives; adding
    // the role must not have displaced it.
    expect(EDITOR_SURFACE_ATTRIBUTES.class).toContain("h-full");
    expect(EDITOR_SURFACE_ATTRIBUTES.class).toContain("focus:outline-none");
  });
});

/**
 * FR-27 / AC-13: the editing surface never uses the browser's own checker,
 * whatever the app-wide switch says and whether or not the editor is
 * read-only. The component renders a mock under test, so the contract is
 * asserted on the exported constant and on a real TipTap view built with it
 * (the same `editorProps.attributes` the component passes).
 */
describe("TipTap editing surface native spell-check opt-out", () => {
  const editors: Editor[] = [];

  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy());
    window.localStorage.clear();
    resetSpellcheckSessionValue();
  });

  function mountEditor(editable: boolean): HTMLElement {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const editor = new Editor({
      element,
      extensions: baseSchemaExtensions,
      content: "<p>Teh quick fox</p>",
      editable,
      editorProps: { attributes: EDITOR_SURFACE_ATTRIBUTES },
    });
    editors.push(editor);
    return editor.view.dom as HTMLElement;
  }

  it('sets spellcheck to the string "false" on the exported constant', () => {
    expect(EDITOR_SURFACE_ATTRIBUTES.spellcheck).toBe("false");
  });

  it("does not add autocapitalize", () => {
    expect(Object.keys(EDITOR_SURFACE_ATTRIBUTES)).not.toContain(
      "autocapitalize",
    );
  });

  it.each([
    ["switch on (nothing stored)", null],
    ["switch on (stored true)", "true"],
    ["switch off", "false"],
  ])("renders spellcheck=false with the %s", (_label, stored) => {
    if (stored !== null) {
      window.localStorage.setItem(SPELLCHECK_ENABLED_STORAGE_KEY, stored);
    }
    resetSpellcheckSessionValue();
    const dom = mountEditor(true);
    expect(dom.getAttribute("spellcheck")).toBe("false");
    expect(dom.hasAttribute("autocapitalize")).toBe(false);
  });

  it("renders spellcheck=false when the editor is read-only", () => {
    const dom = mountEditor(false);
    expect(dom.getAttribute("contenteditable")).toBe("false");
    expect(dom.getAttribute("spellcheck")).toBe("false");
  });
});
