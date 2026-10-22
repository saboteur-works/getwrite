// Last Updated: 2026-10-22

/**
 * Feature 91, Task 21 (FR-4, OQ-15): the PDF export's IBM Plex faces come from
 * the installed @fontsource packages as local files, and a render succeeds
 * with every network path to a font host failing and recorded.
 */
// @vitest-environment node
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Font, renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CompilePDFDocument,
  registerIBMPlexFonts,
} from "../../src/lib/export/CompilePDFDocument";

interface RegisteredFace {
  family: string;
  src: string;
  fontWeight?: number | string;
  fontStyle?: string;
}

function captureRegistrations(): RegisteredFace[] {
  const faces: RegisteredFace[] = [];
  const spy = vi
    .spyOn(Font, "register")
    .mockImplementation((arg: unknown): void => {
      const { family, fonts } = arg as {
        family: string;
        fonts: Omit<RegisteredFace, "family">[];
      };
      for (const f of fonts) faces.push({ family, ...f });
    });
  registerIBMPlexFonts();
  spy.mockRestore();
  return faces;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("registerIBMPlexFonts sources", () => {
  it("registers Serif 400/400 italic and Sans 400/700", () => {
    const faces = captureRegistrations().map(
      (f) => `${f.family}|${f.fontWeight}|${f.fontStyle}`,
    );
    expect(faces.sort()).toEqual(
      [
        "IBM Plex Serif|400|normal",
        "IBM Plex Serif|400|italic",
        "IBM Plex Sans|400|normal",
        "IBM Plex Sans|700|normal",
      ].sort(),
    );
  });

  it("uses only non-remote local files that exist in the installed package", () => {
    const faces = captureRegistrations();
    expect(faces).toHaveLength(4);
    for (const f of faces) {
      expect(f.src).not.toMatch(/^(https?:)?\/\//i);
      expect(f.src).not.toMatch(/^[a-z][a-z0-9+.-]*:\/\//i);
      expect(f.src).toMatch(
        /@fontsource[\\/]ibm-plex-(serif|sans)[\\/]files[\\/]/,
      );
      expect(fs.statSync(f.src).isFile()).toBe(true);
    }
  });
});

describe("PDF render with font hosts blocked", () => {
  it("renders a PDF using the Plex faces and attempts no network request", async () => {
    const attempts: string[] = [];
    const realFetch = globalThis.fetch.bind(globalThis);
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      // fontkit's WOFF2 decoder instantiates a wasm module from a data: URL;
      // that is in-memory, not a network request.
      if (url.startsWith("data:")) {
        return realFetch(input);
      }
      attempts.push(url);
      return Promise.reject(new Error("network blocked"));
    });
    vi.spyOn(http, "request").mockImplementation((...a: unknown[]) => {
      attempts.push(`http.request ${String(a[0])}`);
      throw new Error("network blocked");
    });
    vi.spyOn(https, "request").mockImplementation((...a: unknown[]) => {
      attempts.push(`https.request ${String(a[0])}`);
      throw new Error("network blocked");
    });
    vi.spyOn(net, "connect").mockImplementation((...a: unknown[]) => {
      attempts.push(`net.connect ${String(a[0])}`);
      throw new Error("network blocked");
    });

    registerIBMPlexFonts();
    const buffer = await renderToBuffer(
      React.createElement(CompilePDFDocument, {
        sections: [{ name: "Chapter One", content: "It was a dark night." }],
        includeHeaders: true,
      }) as React.ReactElement<DocumentProps>,
    );

    expect(attempts).toEqual([]);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const text = buffer.toString("latin1");
    expect(text).toMatch(/IBMPlexSerif/);
    expect(text).toMatch(/IBMPlexSans/);
  });
});
