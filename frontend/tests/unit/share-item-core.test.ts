/**
 * Feature 107 Task 2 (FR-3 contract shape, FR-6, FR-7 size outcomes and
 * message, FR-17 validation): the pure share helpers and the import rule.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACCEPTED_SHARE_MIME_TYPES,
  SHARE_IMAGE_MAX_BYTES,
  SHARE_DEFAULT_FILE_NAME,
  SHARE_FILE_NAME_MAX_LENGTH,
  classifyShareText,
  decideShareImageSize,
  filterAcceptedShareItems,
  isAcceptedShareMimeType,
  sanitizeShareFileName,
  shareImageRefusalMessage,
} from "../../src/lib/models/share-item-core";
import {
  mediaTooLargeToShowMessage,
  validateMediaFile,
} from "../../src/lib/models/media-validation";
import type { ShareItem } from "../../src/lib/api/share-capture-types";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("classifyShareText", () => {
  it.each([
    "https://example.com/a?b=1#c",
    "  http://example.com  ",
    "\nhttps://example.com/x\n",
  ])("treats %j as link-only", (text) => {
    const r = classifyShareText({ kind: "text", text });
    const url = text.trim();
    expect(r).toEqual({ linkOnly: true, body: url, capturedLink: url });
  });

  it.each([
    ["a URL with other words", "look at https://example.com now"],
    ["a non-http scheme", "ftp://example.com/file"],
    ["a javascript scheme", "javascript:alert(1)"],
    ["a scheme-less host", "example.com"],
    ["two URLs", "https://a.example https://b.example"],
    ["two URLs on two lines", "https://a.example\nhttps://b.example"],
    ["an empty string", ""],
    ["whitespace only", "   \n"],
    ["a bare scheme", "https://"],
  ])("does not treat %s as link-only and sets no capturedLink", (_n, text) => {
    const r = classifyShareText({ kind: "text", text });
    expect(r.linkOnly).toBe(false);
    expect(r.body).toBe(text);
    expect("capturedLink" in r).toBe(false);
  });

  it("ignores a subject field present on the input", () => {
    const plain = {
      kind: "text",
      text: "plain words",
      subject: "Some title",
    } as const;
    expect(classifyShareText(plain)).toEqual({
      linkOnly: false,
      body: "plain words",
    });

    const link = {
      kind: "text",
      text: "https://example.com",
      subject: "Title",
    } as const;
    expect(classifyShareText(link)).toEqual({
      linkOnly: true,
      body: "https://example.com",
      capturedLink: "https://example.com",
    });
  });
});

describe("decideShareImageSize", () => {
  it("accepts exactly 31,457,280 bytes", () => {
    expect(SHARE_IMAGE_MAX_BYTES).toBe(31_457_280);
    expect(decideShareImageSize(31_457_280)).toEqual({ outcome: "accept" });
  });

  it("refuses 31,457,281 bytes with the FR-148 text naming the size", () => {
    const d = decideShareImageSize(31_457_281);
    expect(d.outcome).toBe("refuse");
    if (d.outcome !== "refuse") return;
    expect(d.size).toBe(31_457_281);
    expect(d.message).toBe(mediaTooLargeToShowMessage(31_457_281));
    expect(d.message).toBe(
      "This file is 30.0 MB. It is too large to show on this device (limit 30 MB).",
    );
  });

  it("accepts zero and small sizes", () => {
    expect(decideShareImageSize(0)).toEqual({ outcome: "accept" });
    expect(decideShareImageSize(1)).toEqual({ outcome: "accept" });
  });

  it.each([undefined, Number.NaN, -1, Number.POSITIVE_INFINITY])(
    "needs a counted read for an unknown or unusable size %s",
    (size) => {
      expect(decideShareImageSize(size)).toEqual({
        outcome: "needs-counted-read",
      });
    },
  );
});

describe("shareImageRefusalMessage", () => {
  it("uses the FR-148 text when a size is given", () => {
    expect(shareImageRefusalMessage(40_000_000)).toBe(
      mediaTooLargeToShowMessage(40_000_000),
    );
  });

  it("uses the write-refusal text only when no size is given", () => {
    const text = shareImageRefusalMessage(undefined);
    expect(text).toBe("File exceeds the 30 MB limit.");
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    const fromValidator = validateMediaFile({
      mime: "image/png",
      size: SHARE_IMAGE_MAX_BYTES + 1,
    });
    expect(fromValidator.ok).toBe(false);
    if (!fromValidator.ok) expect(text).toBe(fromValidator.message);
  });
});

describe("sanitizeShareFileName", () => {
  it("keeps a plain name", () => {
    expect(sanitizeShareFileName("photo.jpg")).toBe("photo.jpg");
  });

  it.each([
    ["../../etc/passwd", "passwd"],
    ["a/b/c.png", "c.png"],
    ["a\\b\\c.png", "c.png"],
    ["..", SHARE_DEFAULT_FILE_NAME],
    ["../", SHARE_DEFAULT_FILE_NAME],
    ["/", SHARE_DEFAULT_FILE_NAME],
    ["....//x.png", "x.png"],
    ["na\0me.png", "name.png"],
    ["  spaced.png  ", "spaced.png"],
  ])("sanitises %j to %j", (input, expected) => {
    const out = sanitizeShareFileName(input);
    expect(out).toBe(expected);
    expect(out).not.toMatch(/[/\\\0]/);
    expect(out).not.toBe("..");
  });

  it.each([null, undefined, "", "   "])(
    "falls back to the default for %j",
    (input) => {
      expect(sanitizeShareFileName(input)).toBe(SHARE_DEFAULT_FILE_NAME);
    },
  );

  it("bounds the length and keeps the extension", () => {
    const out = sanitizeShareFileName(`${"a".repeat(500)}.png`);
    expect(out.length).toBeLessThanOrEqual(SHARE_FILE_NAME_MAX_LENGTH);
    expect(out.endsWith(".png")).toBe(true);
    const noExt = sanitizeShareFileName("b".repeat(500));
    expect(noExt.length).toBe(SHARE_FILE_NAME_MAX_LENGTH);
  });
});

describe("MIME filter", () => {
  it("keeps image/* and text/plain", () => {
    expect(ACCEPTED_SHARE_MIME_TYPES).toEqual(["image/*", "text/plain"]);
    for (const m of [
      "image/png",
      "image/jpeg",
      "IMAGE/WEBP",
      "text/plain",
      "text/plain; charset=utf-8",
    ]) {
      expect(isAcceptedShareMimeType(m)).toBe(true);
    }
  });

  it.each([
    "video/mp4",
    "audio/mpeg",
    "application/pdf",
    "text/html",
    "*/*",
    "image/",
    "image",
    "",
    null,
    undefined,
  ])("drops %j", (m) => {
    expect(isAcceptedShareMimeType(m)).toBe(false);
  });

  it("filters items: text kept, image kept by MIME, others dropped", () => {
    const items: ShareItem[] = [
      { kind: "text", text: "hello" },
      {
        kind: "image",
        uri: "content://a/1",
        name: "a.png",
        mimeType: "image/png",
      },
      {
        kind: "image",
        uri: "content://a/2",
        name: "b.pdf",
        mimeType: "application/pdf",
      },
      {
        kind: "image",
        uri: "content://a/3",
        name: "c.mp4",
        mimeType: "video/mp4",
      },
    ];
    expect(filterAcceptedShareItems(items)).toEqual([items[0], items[1]]);
  });
});

describe("import rules (FR-17)", () => {
  const root = path.resolve(__dirname, "../../src");
  const specifiers = (file: string): string[] =>
    [
      ...readFileSync(file, "utf8").matchAll(
        /(?:^|\n)\s*(?:import|export)\b[^;'"]*?from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g,
      ),
    ].map((m) => m[1] ?? m[2] ?? m[3]);

  const resolveRel = (from: string, spec: string): string => {
    const base = path.resolve(path.dirname(from), spec);
    for (const c of [
      `${base}.ts`,
      `${base}.tsx`,
      path.join(base, "index.ts"),
    ]) {
      if (existsSync(c)) return c;
    }
    throw new Error(`unresolved ${spec} from ${from}`);
  };

  const closure = (entry: string): { files: string[]; bare: string[] } => {
    const seen = new Set<string>();
    const bare = new Set<string>();
    const walk = (f: string): void => {
      if (seen.has(f)) return;
      seen.add(f);
      for (const s of specifiers(f)) {
        if (s.startsWith(".")) walk(resolveRel(f, s));
        else bare.add(s);
      }
    };
    walk(entry);
    return { files: [...seen], bare: [...bare] };
  };

  it("the types module imports nothing", () => {
    const file = path.join(root, "lib/api/share-capture-types.ts");
    expect(specifiers(file)).toEqual([]);
  });

  it("the helpers' whole import graph has no node:*, React or Next", () => {
    const { files, bare } = closure(
      path.join(root, "lib/models/share-item-core.ts"),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const b of bare) {
      expect(b.startsWith("node:")).toBe(false);
      expect(b).not.toMatch(/^(react|react-dom|next)(\/|$)/);
      expect(["fs", "path", "crypto", "os", "child_process"]).not.toContain(b);
    }
  });
});
