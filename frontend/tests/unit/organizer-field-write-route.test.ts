/**
 * Feature 109 Task 12: PUT /api/project/organizer-field. The core module is
 * mocked (Task 10 builds the real one), so these tests cover the route only:
 * body validation, the pass-through of the core's result, the 404 for a gone
 * resource, the locked response, and that no `checkLimit` guards the route.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/models/organizer-field-write-core", () => ({
  setOrganizerFieldsCore: vi.fn(),
}));

import * as route from "../../app/api/project/organizer-field/route";
import { setOrganizerFieldsCore } from "../../src/lib/models/organizer-field-write-core";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { ResourceGoneError } from "../../src/lib/models/resource-gone-error";
import { generateUUID } from "../../src/lib/models/uuid";

const { PUT } = route;
const core = vi.mocked(setOrganizerFieldsCore);

function put(body: unknown, raw?: string): never {
  return new Request("http://localhost/api/project/organizer-field", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body),
  }) as never;
}

function validBody(): {
  projectId: string;
  input: {
    resourceId: string;
    changes: Array<{ target: { kind: "status" }; op: "set"; value: string }>;
  };
} {
  return {
    projectId: generateUUID(),
    input: {
      resourceId: generateUUID(),
      changes: [{ target: { kind: "status" }, op: "set", value: "Draft" }],
    },
  };
}

beforeEach(() => {
  core.mockReset();
});

describe("PUT /api/project/organizer-field", () => {
  it("is force-dynamic and exports only PUT", () => {
    expect(route.dynamic).toBe("force-dynamic");
    expect("GET" in route).toBe(false);
    expect("POST" in route).toBe(false);
  });

  it("passes projectId and input to the core and returns its result", async () => {
    const body = validBody();
    core.mockResolvedValue({ ok: true, resourceId: body.input.resourceId });
    const res = await PUT(put(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      resourceId: body.input.resourceId,
    });
    expect(core).toHaveBeenCalledWith(body.projectId, body.input);
  });

  it("returns a core refusal as 200 with ok:false, reason and message", async () => {
    const refusal = {
      ok: false as const,
      reason: "value-not-in-list" as const,
      message: "That value is not in the list.",
    };
    core.mockResolvedValue(refusal);
    const res = await PUT(put(validBody()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(refusal);
  });

  it("answers 404 with code resource-gone when the core throws ResourceGoneError", async () => {
    const body = validBody();
    core.mockRejectedValue(new ResourceGoneError(body.input.resourceId));
    const res = await PUT(put(body));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.code).toBe("resource-gone");
    expect(JSON.stringify(json)).not.toContain(body.input.resourceId);
  });

  it("answers the locked response when the project is locked", async () => {
    core.mockRejectedValue(new ProjectLockedError("p"));
    const res = await PUT(put(validBody()));
    expect([401, 409]).toContain(res.status);
  });

  it("answers the locked response when the key is missing", async () => {
    core.mockRejectedValue(new MissingProjectKeyError("p"));
    const res = await PUT(put(validBody()));
    expect([401, 409]).toContain(res.status);
  });

  it("rethrows an unexpected core error as a server error, not an empty success", async () => {
    core.mockRejectedValue(new Error("disk exploded"));
    const res = await PUT(put(validBody())).catch(() => null);
    expect(res === null || res.status >= 500).toBe(true);
  });

  it("answers 400 for a non-UUID or missing projectId without calling the core", async () => {
    for (const projectId of ["../etc", "", undefined, 5]) {
      const res = await PUT(put({ ...validBody(), projectId }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid projectId");
    }
    expect(core).not.toHaveBeenCalled();
  });

  it("answers 400 for malformed JSON without echoing the input", async () => {
    const res = await PUT(put(null, "{secret-token"));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).not.toContain("secret-token");
    expect(core).not.toHaveBeenCalled();
  });

  it("answers 400 for a malformed input without echoing it", async () => {
    const marker = "ZZ-marker-9f3";
    const bad: unknown[] = [
      { projectId: generateUUID() },
      { projectId: generateUUID(), input: null },
      { projectId: generateUUID(), input: [marker] },
      { projectId: generateUUID(), input: { resourceId: 3, changes: [] } },
      { projectId: generateUUID(), input: { resourceId: marker } },
      {
        projectId: generateUUID(),
        input: { resourceId: generateUUID(), changes: marker },
      },
      null,
      [marker],
    ];
    for (const body of bad) {
      const res = await PUT(put(body));
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).not.toContain(marker);
    }
    expect(core).not.toHaveBeenCalled();
  });

  it("runs inside withStorageContext and calls no checkLimit", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../app/api/project/organizer-field/route.ts"),
      "utf8",
    );
    expect(source).toContain("withStorageContext(");
    expect(source).not.toMatch(/checkLimit/);
    expect(source).not.toMatch(/sharing-limits|paired-device/i);
  });
});
