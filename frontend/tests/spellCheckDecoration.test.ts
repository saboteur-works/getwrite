/** @vitest-environment jsdom */
/**
 * Spell-checker Task 35: the view-only misspelling underline plugin and its
 * style (FR-25, FR-35, AC-12). The plugin draws only from ranges it is given;
 * wiring worker results into it is Task 36.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { DecorationSet } from "@tiptap/pm/view";
import type { EditorState } from "@tiptap/pm/state";
import SpellCheckDecorationExtension, {
  SPELL_CHECK_CLASS,
  SPELL_CHECK_DECORATION_KEY,
  getSpellDocVersion,
  isSpellCheckActive,
  type SpellCheckMeta,
} from "../components/Editor/Extensions/SpellCheckDecorationExtension";
import { selectSpellCheckerState } from "../src/store/spellingAvailabilitySlice";

const editors: Editor[] = [];
let isOn = true;

function mount(text = "teh quick brown fox"): {
  editor: Editor;
  onUpdate: ReturnType<typeof vi.fn>;
} {
  const onUpdate = vi.fn();
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: [
      StarterKit,
      SpellCheckDecorationExtension.configure({ isEnabled: () => isOn }),
    ],
    content: `<p>${text}</p>`,
    onUpdate,
  });
  editors.push(editor);
  return { editor, onUpdate };
}

afterEach(() => {
  while (editors.length > 0) editors.pop()?.destroy();
  isOn = true;
});

function decorations(state: EditorState): DecorationSet {
  const set = SPELL_CHECK_DECORATION_KEY.getState(state)?.decorations;
  if (!set) throw new Error("plugin state missing");
  return set;
}

function ranges(state: EditorState): Array<[number, number]> {
  return decorations(state)
    .find()
    .map((d) => [d.from, d.to]);
}

function push(editor: Editor, meta: SpellCheckMeta): void {
  editor.view.dispatch(
    editor.state.tr.setMeta(SPELL_CHECK_DECORATION_KEY, meta),
  );
}

function pushSet(
  editor: Editor,
  rs: Array<{ from: number; to: number }>,
): void {
  push(editor, {
    type: "set",
    version: getSpellDocVersion(editor.state),
    ranges: rs,
  });
}

describe("SpellCheckDecorationExtension", () => {
  it("draws a decoration for each supplied range, with the spell class", () => {
    const { editor } = mount();
    pushSet(editor, [{ from: 1, to: 4 }]);
    expect(ranges(editor.state)).toEqual([[1, 4]]);
    expect(
      editor.view.dom.querySelectorAll(`.${SPELL_CHECK_CLASS}`),
    ).toHaveLength(1);
    expect(
      editor.view.dom.querySelector(`.${SPELL_CHECK_CLASS}`)?.textContent,
    ).toBe("teh");
  });

  it("is empty initially and draws nothing when the switch is off", () => {
    isOn = false;
    const { editor } = mount();
    expect(ranges(editor.state)).toEqual([]);
    pushSet(editor, [{ from: 1, to: 4 }]);
    expect(ranges(editor.state)).toEqual([]);
  });

  it("removes existing underlines at once when the switch turns off and a refresh is sent", () => {
    const { editor } = mount();
    pushSet(editor, [{ from: 1, to: 4 }]);
    isOn = false;
    push(editor, { type: "refresh" });
    expect(ranges(editor.state)).toEqual([]);
    isOn = true;
    push(editor, { type: "refresh" });
    expect(ranges(editor.state)).toEqual([]);
  });

  it("clear removes decorations", () => {
    const { editor } = mount();
    pushSet(editor, [{ from: 1, to: 4 }]);
    push(editor, { type: "clear" });
    expect(ranges(editor.state)).toEqual([]);
  });

  it("is empty when the checker is not active (lists not loaded, engine failed)", () => {
    const base = {
      spelling: {
        status: "not-loaded" as const,
        errorMessage: "",
        aliasTableStatus: "loaded" as const,
        aliasTableErrorMessage: "",
      },
      spellingAvailability: { engineFailure: null, unsupportedBrowser: null },
    };
    expect(isSpellCheckActive(true, selectSpellCheckerState(base))).toBe(false);
    const loaded = {
      ...base,
      spelling: { ...base.spelling, status: "loaded" as const },
    };
    expect(isSpellCheckActive(true, selectSpellCheckerState(loaded))).toBe(
      true,
    );
    expect(isSpellCheckActive(false, selectSpellCheckerState(loaded))).toBe(
      false,
    );
    const failed = {
      ...loaded,
      spellingAvailability: { engineFailure: "boom", unsupportedBrowser: null },
    };
    expect(isSpellCheckActive(true, selectSpellCheckerState(failed))).toBe(
      false,
    );
  });

  it("applying decorations leaves the document JSON identical and does not fire onUpdate", () => {
    const { editor, onUpdate } = mount();
    const before = JSON.stringify(editor.getJSON());
    pushSet(editor, [{ from: 1, to: 4 }]);
    push(editor, { type: "clear" });
    pushSet(editor, [{ from: 5, to: 10 }]);
    expect(ranges(editor.state)).toEqual([[5, 10]]);
    expect(JSON.stringify(editor.getJSON())).toBe(before);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("maps decorations through an edit before them", () => {
    const { editor } = mount();
    pushSet(editor, [{ from: 5, to: 10 }]); // "quick"
    editor.view.dispatch(editor.state.tr.insertText("XX", 1));
    expect(ranges(editor.state)).toEqual([[7, 12]]);
    expect(editor.state.doc.textBetween(7, 12)).toBe("quick");
  });

  it("drops a decoration whose text is deleted", () => {
    const { editor } = mount();
    pushSet(editor, [{ from: 1, to: 4 }]);
    editor.view.dispatch(editor.state.tr.delete(1, 5));
    expect(ranges(editor.state)).toEqual([]);
  });

  it("ignores results for an older document version, and bumps the version per edit", () => {
    const { editor } = mount();
    const v0 = getSpellDocVersion(editor.state);
    editor.view.dispatch(editor.state.tr.insertText("X", 1));
    expect(getSpellDocVersion(editor.state)).toBe(v0 + 1);
    push(editor, { type: "set", version: v0, ranges: [{ from: 1, to: 3 }] });
    expect(ranges(editor.state)).toEqual([]);
    push(editor, {
      type: "set",
      version: v0 + 1,
      ranges: [{ from: 1, to: 3 }],
    });
    expect(ranges(editor.state)).toEqual([[1, 3]]);
  });

  it("skips empty and out-of-document ranges", () => {
    const { editor } = mount();
    pushSet(editor, [
      { from: 3, to: 3 },
      { from: 0, to: 2 },
      { from: 5, to: 9999 },
      { from: 1, to: 4 },
    ]);
    expect(ranges(editor.state)).toEqual([[1, 4]]);
  });

  it("selection-only transactions keep the decorations", () => {
    const { editor } = mount();
    pushSet(editor, [{ from: 1, to: 4 }]);
    editor.commands.setTextSelection(8);
    expect(ranges(editor.state)).toEqual([[1, 4]]);
  });
});

/* ── Style ── */

const stylesDir = path.join(__dirname, "../styles");
const editorCss = fs.readFileSync(path.join(stylesDir, "editor.css"), "utf8");
const utilitiesCss = fs.readFileSync(
  path.join(stylesDir, "getwrite-utilities.css"),
  "utf8",
);

function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no rule ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function tokenIn(css: string, selector: string, token: string): string {
  const match = new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`).exec(
    block(css, selector),
  );
  if (!match) throw new Error(`${token} not a hex in ${selector}`);
  return match[1];
}

describe("spell-error style", () => {
  const rule = block(editorCss, `.tiptap .${SPELL_CHECK_CLASS}`);

  it("uses a wavy or dotted underline, not colour alone", () => {
    expect(rule).toMatch(/text-decoration:[^;]*underline[^;]*(wavy|dotted)/);
  });

  it("sets no red colour token", () => {
    expect(rule).not.toMatch(/red/i);
    expect(rule).not.toMatch(/#(d44040)/i);
    for (const sel of [
      ".appshell-shell",
      ".appshell-shell.appshell-theme-dark",
      "html.gw-theme-light",
      "html.gw-theme-dark",
    ]) {
      expect(
        block(utilitiesCss, sel).match(
          /--color-gw-spell-underline:[^;]*;/,
        )?.[0],
      ).not.toMatch(/red/i);
    }
  });

  it("meets 3:1 non-text contrast against the editor background in light and dark", () => {
    const paper = "#f0ede6"; // --color-gw-paper (getwrite-theme.css)
    const darkEditor = tokenIn(
      utilitiesCss,
      ".appshell-shell.appshell-theme-dark",
      "--color-gw-editor",
    );
    expect(darkEditor).toBe("#1c1c1a");
    const pairs: Array<[string, string, string]> = [
      [".appshell-shell", paper, "light shell"],
      ["html.gw-theme-light", paper, "light html"],
      [".appshell-shell.appshell-theme-dark", darkEditor, "dark shell"],
      ["html.gw-theme-dark", darkEditor, "dark html"],
    ];
    for (const [selector, background] of pairs) {
      const colour = tokenIn(
        utilitiesCss,
        selector,
        "--color-gw-spell-underline",
      );
      expect(contrast(colour, background)).toBeGreaterThanOrEqual(3);
    }
  });

  it("has a forced-colors rule", () => {
    const start = editorCss.indexOf("@media (forced-colors: active)");
    expect(start).toBeGreaterThan(-1);
    expect(editorCss.slice(start)).toMatch(
      new RegExp(
        `\\.${SPELL_CHECK_CLASS}[^}]*text-decoration-color:\\s*(LinkText|Highlight|CanvasText)`,
      ),
    );
  });
});

describe("no storage access", () => {
  it("the extension module imports no sidecar, index or file API", () => {
    const source = fs.readFileSync(
      path.join(
        __dirname,
        "../components/Editor/Extensions/SpellCheckDecorationExtension.ts",
      ),
      "utf8",
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(
      /from\s+"(node:)?fs"|sidecar|indexer|\/api\/|fetch\(/,
    );
  });
});
