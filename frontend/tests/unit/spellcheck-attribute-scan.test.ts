import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

/**
 * FR-28 / AC-13: every text-like `<input>` and every `<textarea>` rendered
 * directly (outside the shared `Input` / `Textarea` wrappers) must set
 * `spellCheck` explicitly. Stories are excluded.
 */

const FRONTEND_ROOT = join(__dirname, "..", "..");
const SCANNED_DIRS = ["components", "app"] as const;

/** Input types that hold no prose or are button-like (exempt by FR-28). */
const EXEMPT_INPUT_TYPES: ReadonlySet<string> = new Set([
  "checkbox",
  "radio",
  "range",
  "file",
  "color",
  "button",
  "submit",
  "reset",
  "image",
  "hidden",
]);

interface Offender {
  readonly line: number;
  readonly tag: string;
}

function attributeNamed(
  attrs: ts.JsxAttributes,
  name: string,
): ts.JsxAttribute | undefined {
  for (const prop of attrs.properties) {
    if (ts.isJsxAttribute(prop) && prop.name.getText() === name) return prop;
  }
  return undefined;
}

function staticType(attr: ts.JsxAttribute | undefined): string | null {
  const init = attr?.initializer;
  if (!init) return null;
  if (ts.isStringLiteral(init)) return init.text;
  if (
    ts.isJsxExpression(init) &&
    init.expression &&
    ts.isStringLiteralLike(init.expression)
  ) {
    return init.expression.text;
  }
  return null;
}

/** Returns the elements in `source` that need `spellCheck` and lack it. */
export function findUnsetSpellCheck(
  fileName: string,
  source: string,
): Offender[] {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const offenders: Offender[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText();
      if (tag === "input" || tag === "textarea") {
        const type = staticType(attributeNamed(node.attributes, "type"));
        const isExempt =
          tag === "input" && type !== null && EXEMPT_INPUT_TYPES.has(type);
        if (!isExempt && !attributeNamed(node.attributes, "spellCheck")) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
          offenders.push({ line: line + 1, tag });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return offenders;
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (full.endsWith(".tsx") && !/\.stories\.tsx$/.test(full)) {
      out.push(full);
    }
  }
  return out;
}

describe("spellCheck attribute scan (FR-28)", () => {
  it("flags a text input without spellCheck", () => {
    const src = `export const A = () => <input type="text" value="" />;`;
    expect(findUnsetSpellCheck("a.tsx", src)).toHaveLength(1);
  });

  it("flags an input with no type and one with a dynamic type", () => {
    const src = `export const A = (t: string) => <div><input /><input type={t} /></div>;`;
    expect(findUnsetSpellCheck("a.tsx", src)).toHaveLength(2);
  });

  it("flags any textarea without spellCheck", () => {
    const src = `export const A = () => <textarea />;`;
    expect(findUnsetSpellCheck("a.tsx", src)).toHaveLength(1);
  });

  it("accepts spellCheck={false} and exempts non-text input types", () => {
    const src = `export const A = () => (
      <div>
        <input type="text" spellCheck={false} />
        <textarea spellCheck={false} />
        <input type="checkbox" />
        <input type="radio" />
        <input type="range" />
        <input type="file" />
        <input type="color" />
        <input type={"button"} />
      </div>
    );`;
    expect(findUnsetSpellCheck("a.tsx", src)).toEqual([]);
  });

  it("passes on components/ and app/ (stories excluded)", () => {
    const failures: string[] = [];
    for (const dir of SCANNED_DIRS) {
      for (const file of listSourceFiles(join(FRONTEND_ROOT, dir))) {
        for (const o of findUnsetSpellCheck(file, readFileSync(file, "utf8"))) {
          failures.push(
            `${relative(FRONTEND_ROOT, file)}:${o.line} <${o.tag}>`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("keeps MarkdownSourceView spellCheck={false} and undecorated", () => {
    const src = readFileSync(
      join(FRONTEND_ROOT, "components/Editor/MarkdownSourceView.tsx"),
      "utf8",
    );
    expect(src).toMatch(/spellCheck=\{false\}/);
    expect(src).not.toMatch(/spell-?check(ing)?(Decoration|Extension)/i);
  });

  it("does not put a spellCheck backstop on <body> (OQ-11 resolved against)", () => {
    const src = readFileSync(join(FRONTEND_ROOT, "app/layout.tsx"), "utf8");
    expect(src).not.toMatch(/<body[^>]*spellCheck/);
  });
});
