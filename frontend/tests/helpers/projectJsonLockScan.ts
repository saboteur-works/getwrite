/**
 * Feature 92, Task 23: the static scanner behind
 * `tests/unit/project-json-lock-scan.test.ts`.
 *
 * Pure text analysis (no file access, no type information). It reports, per
 * module source:
 * - `direct-write`: a call to a file-writing function whose first argument is
 *   (or is a local constant built from) a `project.json` path or a resource
 *   sidecar path. Such a write bypasses the per-file lock sink
 *   (`updateProjectJson`, `mutateSidecar`).
 * - `sidecar-path-built`: a sidecar path assembled by hand
 *   (`resource-${id}.meta.json`) instead of `sidecarPathForProject`, which
 *   catches a write planned or issued by a route the call scan cannot follow.
 * - `sidecar-read-then-write`: a top-level declaration that calls
 *   `readSidecar` and later calls `writeSidecar` or `updateSidecarCore`.
 *
 * Limits, stated so the test does not claim more than it checks: the scan sees
 * one file at a time (a read in one function whose result is written by
 * another is not seen), follows a path through at most three local `const`
 * hops, and reads names, not types.
 */

export type FindingKind =
  | "direct-write"
  | "sidecar-path-built"
  | "sidecar-read-then-write";

export interface ScanFinding {
  kind: FindingKind;
  /** Name of the enclosing top-level declaration (or `<module>`). */
  scope: string;
  /** 1-based line of the offending call. */
  line: number;
  /** What the first argument resolved to: `project.json` or `sidecar`. */
  target?: "project.json" | "sidecar";
  call: string;
}

const WRITE_CALLS: readonly string[] = [
  "writeFile",
  "writeFileSync",
  "atomicWriteFile",
  "appendFile",
  "copyFile",
  "rename",
];
const SIDECAR_WRITERS: readonly string[] = [
  "writeSidecar",
  "updateSidecarCore",
];

/** Replaces comments with spaces (newlines kept) so line numbers survive. */
export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") {
        out += " ";
        i += 1;
      }
    } else if (c === "/" && n === "*") {
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += "  ";
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i += 1;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") {
          out += src[i];
          i += 1;
        }
        out += src[i];
        i += 1;
      }
      out += quote;
      i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** Text between the parenthesis opening at `open` and its match. */
function balancedArgs(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const c = src[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    if (c === ")" || c === "]" || c === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return src.slice(open + 1);
}

function firstArg(args: string): string {
  let depth = 0;
  for (let i = 0; i < args.length; i += 1) {
    const c = args[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    if (c === ")" || c === "]" || c === "}") depth -= 1;
    if (c === "," && depth === 0) return args.slice(0, i).trim();
  }
  return args.trim();
}

function classify(expr: string): "project.json" | "sidecar" | undefined {
  if (/PROJECT_FILENAME|project\.json/.test(expr)) return "project.json";
  if (/sidecar|\.meta\.json|meta\.json/i.test(expr)) return "sidecar";
  return undefined;
}

/** Classifies a path expression, following local `const` hops. */
function resolveTarget(
  expr: string,
  src: string,
  hops = 3,
): "project.json" | "sidecar" | undefined {
  const direct = classify(expr);
  if (direct || hops === 0) return direct;
  const ident = /^[A-Za-z_$][\w$]*$/.exec(expr.trim());
  if (!ident) return undefined;
  const decl = new RegExp(
    `\\b(?:const|let|var)\\s+${ident[0].replace(/\$/g, "\\$")}\\b[^=;]*=([^;]*);`,
  ).exec(src);
  return decl ? resolveTarget(decl[1], src, hops - 1) : undefined;
}

interface Segment {
  name: string;
  start: number;
  end: number;
}

/** Top-level declarations start in column 0 (the tree is prettier-formatted). */
function segments(src: string): Segment[] {
  const starts: Array<{ index: number; name: string }> = [];
  const re =
    /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    starts.push({ index: m.index, name: m[1] });
  }
  return starts.map((s, k) => ({
    name: s.name,
    start: s.index,
    end: k + 1 < starts.length ? starts[k + 1].index : src.length,
  }));
}

function lineOf(src: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (src[i] === "\n") line += 1;
  return line;
}

function callsIn(
  src: string,
  names: readonly string[],
  from: number,
  to: number,
): Array<{ name: string; index: number; args: string }> {
  const re = new RegExp(`(?<![\\w$])(${names.join("|")})\\s*\\(`, "g");
  const found: Array<{ name: string; index: number; args: string }> = [];
  const slice = src.slice(from, to);
  for (let m = re.exec(slice); m; m = re.exec(slice)) {
    const open = from + m.index + m[0].length - 1;
    found.push({
      name: m[1],
      index: from + m.index,
      args: balancedArgs(src, open),
    });
  }
  return found;
}

/** Scans one module's source text. */
export function scanSource(rawSource: string): ScanFinding[] {
  const src = stripComments(rawSource);
  const findings: ScanFinding[] = [];
  const segs = segments(src);
  const scopeAt = (index: number): string =>
    segs.find((s) => index >= s.start && index < s.end)?.name ?? "<module>";

  for (const call of callsIn(src, WRITE_CALLS, 0, src.length)) {
    const target = resolveTarget(firstArg(call.args), src);
    if (!target) continue;
    findings.push({
      kind: "direct-write",
      scope: scopeAt(call.index),
      line: lineOf(src, call.index),
      target,
      call: call.name,
    });
  }

  const built = /resource-\$\{[^}]*\}\.meta\.json/g;
  for (let m = built.exec(src); m; m = built.exec(src)) {
    findings.push({
      kind: "sidecar-path-built",
      scope: scopeAt(m.index),
      line: lineOf(src, m.index),
      call: "resource-${id}.meta.json",
    });
  }

  for (const seg of segs) {
    const reads = callsIn(src, ["readSidecar"], seg.start, seg.end);
    if (reads.length === 0) continue;
    const firstRead = reads[0].index;
    for (const w of callsIn(src, SIDECAR_WRITERS, firstRead, seg.end)) {
      findings.push({
        kind: "sidecar-read-then-write",
        scope: seg.name,
        line: lineOf(src, w.index),
        call: w.name,
      });
    }
  }
  return findings;
}
