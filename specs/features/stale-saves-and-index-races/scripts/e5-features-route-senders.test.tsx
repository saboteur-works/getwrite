/** @vitest-environment jsdom */
/**
 * Experiment E-5 (Feature 93, Task 4). NOT part of the suite.
 *
 * Drives the real RelationshipTypesSettings, ProjectFeatureToggles and
 * OrganizerCardBodySettings (real store thunks, real transport) against the
 * real features route handler (`POST` in app/api/project/features/route.ts,
 * which runs updateFeatureConfig -> updateProjectJson) on a temp-directory
 * project. `fetch` is replaced by a controlled-delay stub that builds a
 * NextRequest, calls the real `POST`, and holds the FIRST request's response
 * (variant "after-route": the write is on disk, the response is held) or the
 * FIRST request itself (variant "before-route": held before reaching the
 * route). The second edit is made while the first is held; then the second
 * request completes; then the first is released.
 *
 * Per repetition it records: the number of requests the sender issued, the
 * stored block (read from project.json) and the client-store block after
 * everything settled. Result JSON goes to $E5_RESULT_OUT.
 *
 * Edits (both from the same window, second made while the first is pending):
 *  - relationshipTypes: add "Alpha", then add "Beta".
 *  - features: tick Synopsis, then tick Notes.
 *  - organizerCardBody: starting at {text-excerpt, 200}, set length 300, then 400.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import React from "react";
import { afterEach, describe, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Provider } from "react-redux";
import { NextRequest } from "next/server";
import { makeStore } from "../../../../frontend/src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../../../frontend/src/store/projectsSlice";
import { createProject } from "../../../../frontend/src/lib/models/project";
import { PROJECT_FILENAME } from "../../../../frontend/src/lib/models/project-config";
import { generateUUID } from "../../../../frontend/src/lib/models/uuid";
import { DEFAULT_RELATIONSHIP_TYPES } from "../../../../frontend/src/lib/models/default-relationship-types";
import RelationshipTypesSettings from "../../../../frontend/components/preferences/RelationshipTypesSettings";
import ProjectFeatureToggles from "../../../../frontend/components/preferences/ProjectFeatureToggles";
import OrganizerCardBodySettings from "../../../../frontend/components/preferences/OrganizerCardBodySettings";
import { POST } from "../../../../frontend/app/api/project/features/route";
import { removeDirRetry } from "../../../../frontend/tests/unit/helpers/fs-utils";

vi.mock("../../../../frontend/src/lib/toast-service", () => {
  const toastService = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    dismissAll: vi.fn(),
  };
  return { toastService, default: toastService };
});

const REPS = Number(process.env.E5_REPS ?? 20);
type Sender = "relationshipTypes" | "features" | "organizerCardBody";
type Variant = "after-route" | "before-route";
const SENDERS: Sender[] = ["relationshipTypes", "features", "organizerCardBody"];
const VARIANTS: Variant[] = ["after-route", "before-route"];

const dirs: string[] = [];
const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;
const originalFetch = globalThis.fetch;
afterEach(async () => {
  cleanup();
  globalThis.fetch = originalFetch;
  if (originalProjectsDir === undefined)
    delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalProjectsDir;
  for (const dir of dirs.splice(0)) await removeDirRetry(dir);
});

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));
const eq = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

interface Gate {
  promise: Promise<void>;
  open: () => void;
}
function makeGate(): Gate {
  let open!: () => void;
  const promise = new Promise<void>((r) => (open = r));
  return { promise, open };
}

interface ProjectSetup {
  projectId: string;
  projectRoot: string;
  config: Record<string, unknown>;
}

async function makeProject(
  batch: string,
  sender: Sender,
): Promise<ProjectSetup> {
  const projectId = generateUUID();
  const projectRoot = path.join(batch, projectId);
  await fs.mkdir(projectRoot, { recursive: true });
  const config: Record<string, unknown> =
    sender === "organizerCardBody"
      ? { organizerCardBody: { source: "text-excerpt", excerptLength: 200 } }
      : sender === "relationshipTypes"
        ? { features: { entities: true } }
        : { features: { entities: true } };
  const project = createProject({ name: "e5", config });
  await fs.writeFile(
    path.join(projectRoot, PROJECT_FILENAME),
    JSON.stringify(project),
    "utf8",
  );
  return { projectId, projectRoot, config };
}

function mountStore(setup: ProjectSetup, sender: Sender) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: "e5-internal-id",
      rootPath: setup.projectRoot,
      features: { entities: true },
      ...(sender === "organizerCardBody"
        ? { organizerCardBody: { source: "text-excerpt", excerptLength: 200 } }
        : {}),
    }),
  );
  store.dispatch(setSelectedProjectId("e5-internal-id"));
  const ui =
    sender === "relationshipTypes" ? (
      <RelationshipTypesSettings />
    ) : sender === "features" ? (
      <ProjectFeatureToggles />
    ) : (
      <OrganizerCardBodySettings />
    );
  render(<Provider store={store}>{ui}</Provider>);
  return store;
}

function edit(sender: Sender, n: 1 | 2): void {
  if (sender === "relationshipTypes") {
    const input = screen.getByLabelText(/new relationship type/i);
    fireEvent.change(input, { target: { value: n === 1 ? "Alpha" : "Beta" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
  } else if (sender === "features") {
    fireEvent.click(
      screen.getByRole("checkbox", { name: n === 1 ? /synopsis/i : /notes/i }),
    );
  } else {
    const input = screen.getByLabelText(/excerpt length/i);
    fireEvent.change(input, { target: { value: n === 1 ? "300" : "400" } });
  }
}

type Bag = Record<string, unknown>;
function storedBlock(sender: Sender, config: Bag): unknown {
  return sender === "organizerCardBody"
    ? config.organizerCardBody
    : sender === "features"
      ? config.features
      : config.relationshipTypes;
}
function expectedBoth(sender: Sender): unknown {
  if (sender === "relationshipTypes")
    return [...DEFAULT_RELATIONSHIP_TYPES, "Alpha", "Beta"];
  if (sender === "features")
    return { entities: true, synopsis: true, notes: true };
  return { source: "text-excerpt", excerptLength: 400 };
}
/** Compares order-insensitively for features (object), exact for the rest. */
function holdsBoth(sender: Sender, block: unknown): boolean {
  if (sender === "features") {
    const b = (block ?? {}) as Bag;
    return b.synopsis === true && b.notes === true && b.entities === true;
  }
  return eq(block, expectedBoth(sender));
}

async function runRep(
  batch: string,
  sender: Sender,
  variant: Variant,
): Promise<Bag> {
  const setup = await makeProject(batch, sender);
  const store = mountStore(setup, sender);
  const gate1 = makeGate();
  const bodies: unknown[] = [];
  let started = 0;
  let done2 = false;
  let rejected = 0;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const n = ++started;
    bodies.push(JSON.parse(init.body as string));
    const req = new NextRequest("http://localhost/api/project/features", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: init.body as string,
    });
    if (n === 1 && variant === "before-route") await gate1.promise;
    const res = await POST(req);
    if (n === 1 && variant === "after-route") await gate1.promise;
    if (!res.ok) rejected++;
    if (n === 2) done2 = true;
    return res;
  }) as typeof fetch;

  edit(sender, 1);
  for (let i = 0; i < 200 && started < 1; i++) await sleep(5);
  // first save is held and pending; make the second edit from the same window
  edit(sender, 2);
  for (let i = 0; i < 40 && started < 2; i++) await sleep(5);
  if (started >= 2) for (let i = 0; i < 400 && !done2; i++) await sleep(5);
  gate1.open();
  await sleep(150);

  let unparseable = 0;
  let config: Bag = {};
  try {
    config = (
      JSON.parse(
        await fs.readFile(path.join(setup.projectRoot, PROJECT_FILENAME), "utf8"),
      ) as { config: Bag }
    ).config;
  } catch {
    unparseable = 1;
  }
  const state = store.getState().projects.projects["e5-internal-id"] as Bag;
  const storeBlock =
    sender === "organizerCardBody"
      ? state.organizerCardBody
      : sender === "features"
        ? state.features
        : state.relationshipTypes;
  const stored = storedBlock(sender, config);
  cleanup();
  return {
    requests: started,
    rejected,
    unparseable,
    storedHoldsBoth: unparseable === 0 && holdsBoth(sender, stored),
    storeHoldsBoth: holdsBoth(sender, storeBlock),
    stored,
    storeBlock,
    bodies,
  };
}

describe("E-5 features-route senders", () => {
  it("records two quick edits per sender", async () => {
    const batch = await fs.mkdtemp(path.join(os.tmpdir(), "f93-e5-"));
    dirs.push(batch);
    process.env.GETWRITE_PROJECTS_DIR = batch;
    const out: Bag = { batch, reps: REPS, results: {} };
    for (const sender of SENDERS)
      for (const variant of VARIANTS) {
        const reps: Bag[] = [];
        for (let i = 0; i < REPS; i++)
          reps.push(await runRep(batch, sender, variant));
        const count = (k: string) => reps.filter((r) => r[k] === true).length;
        (out.results as Bag)[`${sender}/${variant}`] = {
          reps: REPS,
          storedHoldsBoth: count("storedHoldsBoth"),
          storeHoldsBoth: count("storeHoldsBoth"),
          unparseable: reps.reduce((s, r) => s + (r.unparseable as number), 0),
          rejected: reps.reduce((s, r) => s + (r.rejected as number), 0),
          requestsPerRep: [...new Set(reps.map((r) => r.requests))],
          sample: reps[0],
        };
      }
    if (process.env.E5_RESULT_OUT)
      await fs.writeFile(
        process.env.E5_RESULT_OUT,
        JSON.stringify(out, null, 2),
        "utf8",
      );
    console.log(JSON.stringify(out, null, 2));
  });
});
