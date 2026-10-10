import { describe, expect, it } from "vitest";

import { isSameOrigin } from "../../src/lib/sharing/same-origin";

function h(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe("isSameOrigin", () => {
  it("always passes GET and HEAD", () => {
    expect(isSameOrigin({ method: "GET", headers: h({ host: "a:1" }) })).toBe(
      true,
    );
    expect(isSameOrigin({ method: "HEAD", headers: h({}) })).toBe(true);
  });

  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    describe(method, () => {
      it("passes a matching Origin", () => {
        expect(
          isSameOrigin({
            method,
            headers: h({
              host: "pc.local:3000",
              origin: "http://pc.local:3000",
            }),
          }),
        ).toBe(true);
      });
      it("fails a mismatching Origin", () => {
        expect(
          isSameOrigin({
            method,
            headers: h({
              host: "pc.local:3000",
              origin: "http://evil.example",
            }),
          }),
        ).toBe(false);
      });
      it("passes an absent Origin with a matching Referer", () => {
        expect(
          isSameOrigin({
            method,
            headers: h({
              host: "pc.local:3000",
              referer: "http://pc.local:3000/x?y=1",
            }),
          }),
        ).toBe(true);
      });
      it("fails an absent Origin with a mismatching Referer", () => {
        expect(
          isSameOrigin({
            method,
            headers: h({
              host: "pc.local:3000",
              referer: "http://evil.example/x",
            }),
          }),
        ).toBe(false);
      });
      it("fails when both Origin and Referer are absent", () => {
        expect(
          isSameOrigin({ method, headers: h({ host: "pc.local:3000" }) }),
        ).toBe(false);
      });
      it("fails an Origin that is not a valid URL", () => {
        expect(
          isSameOrigin({
            method,
            headers: h({ host: "pc.local:3000", origin: "not a url" }),
          }),
        ).toBe(false);
      });
    });
  }

  it("fails when Host is absent on a state-changing method", () => {
    expect(
      isSameOrigin({ method: "POST", headers: h({ origin: "http://a" }) }),
    ).toBe(false);
  });

  it("fails the literal 'null' Origin", () => {
    expect(
      isSameOrigin({
        method: "POST",
        headers: h({ host: "a", origin: "null" }),
      }),
    ).toBe(false);
  });

  it("fails an Origin matching X-Forwarded-Host but not Host", () => {
    expect(
      isSameOrigin({
        method: "POST",
        headers: h({
          host: "real:3000",
          "x-forwarded-host": "forged.example",
          origin: "http://forged.example",
        }),
      }),
    ).toBe(false);
  });

  it("passes an Origin matching Host even when X-Forwarded-Host names another host", () => {
    expect(
      isSameOrigin({
        method: "POST",
        headers: h({
          host: "real:3000",
          "x-forwarded-host": "other.example",
          origin: "http://real:3000",
        }),
      }),
    ).toBe(true);
  });
});
