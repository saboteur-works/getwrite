/** @vitest-environment jsdom */
/*
 * Feature 108, Task 18 (FR-14 failure handling, FR-15 non-optimistic writes):
 * the claim flows with injected fake transport functions. Patterned on
 * annotation-flows.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { readFileSync } from "node:fs";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import {
  addClaimFlow,
  updateClaimStatementFlow,
  updateClaimStatusFlow,
  updateClaimTargetFlow,
  type ClaimFlowApi,
} from "../../src/lib/claim-flows";
import { ANNOTATION_TRANSACTION_META } from "../../src/lib/annotation-flows";
import type { Annotation } from "../../src/lib/models";

const ID = "11111111-1111-4111-8111-111111111111";
const editors: Editor[] = [];

function mount(text: string): Editor {
  const content: JSONContent = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: baseSchemaExtensions,
    content,
  });
  editors.push(editor);
  return editor;
}

function markedText(editor: Editor, id: string): string {
  let out = "";
  editor.state.doc.descendants((node) => {
    if (
      node.isText &&
      node.marks.some((m) => m.type.name === "annotation" && m.attrs.id === id)
    )
      out += node.text;
  });
  return out;
}

function claim(status = "unverified", body = "stmt"): Annotation {
  return {
    id: ID,
    body,
    quote: "Hello",
    createdAt: "t",
    updatedAt: "t",
    claim: { status, statusChangedAt: "2026-11-11T00:00:00.000Z" },
  };
}

function fakeApi(over: Partial<ClaimFlowApi> = {}): ClaimFlowApi {
  return {
    add: vi.fn(async () => claim()),
    update: vi.fn(async () => claim()),
    ...over,
  };
}

const base = { projectId: "p", resourceId: "r" };

afterEach(() => {
  vi.unstubAllGlobals();
  while (editors.length) editors.pop()?.destroy();
});

describe("addClaimFlow", () => {
  it("makes a valid v4 id when crypto.randomUUID is missing (insecure context)", async () => {
    vi.stubGlobal("crypto", {
      getRandomValues: globalThis.crypto.getRandomValues.bind(
        globalThis.crypto,
      ),
    });
    expect(
      (globalThis.crypto as { randomUUID?: unknown }).randomUUID,
    ).toBeUndefined();
    const editor = mount("Hello world");
    const api = fakeApi();
    const result = await addClaimFlow(api, {
      editor,
      ...base,
      statement: "stmt",
      range: { from: 1, to: 6 },
    });
    expect(result.ok).toBe(true);
    expect(api.add).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(api.add).mock.calls[0][2];
    expect(sent.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("stores the claim, then sets the annotation mark with the stored id", async () => {
    const editor = mount("Hello world");
    const order: string[] = [];
    const dispatch = editor.view.dispatch.bind(editor.view);
    const spy = vi.spyOn(editor.view, "dispatch").mockImplementation((tr) => {
      order.push(`mark:${String(tr.getMeta(ANNOTATION_TRANSACTION_META))}`);
      dispatch(tr);
    });
    const api = fakeApi({
      add: vi.fn(async () => {
        order.push("write");
        return claim();
      }),
    });
    const result = await addClaimFlow(api, {
      editor,
      ...base,
      statement: "stmt",
      range: { from: 1, to: 6 },
      id: ID,
    });
    spy.mockRestore();
    expect(result.ok).toBe(true);
    expect(order).toEqual(["write", "mark:true"]);
    expect(api.add).toHaveBeenCalledWith("p", "r", {
      id: ID,
      statement: "stmt",
      quote: "Hello",
    });
    expect(markedText(editor, ID)).toBe("Hello");
  });

  it("a failed write adds no mark and returns an error text", async () => {
    const editor = mount("Hello world");
    const api = fakeApi({
      add: vi.fn(async () => {
        throw new Error("disk full");
      }),
    });
    const result = await addClaimFlow(api, {
      editor,
      ...base,
      statement: "stmt",
      range: { from: 1, to: 6 },
      id: ID,
    });
    expect(result).toEqual({ ok: false, stage: "write", message: "disk full" });
    expect(markedText(editor, ID)).toBe("");
  });

  it("a failed mark after a stored write keeps the claim and reports it detached", async () => {
    const editor = mount("Hello world");
    const api = fakeApi({
      add: vi.fn(async () => {
        // The passage changes while the write is in flight.
        editor.commands.setContent("Changed text");
        return claim();
      }),
    });
    const result = await addClaimFlow(api, {
      editor,
      ...base,
      statement: "stmt",
      range: { from: 1, to: 6 },
      id: ID,
    });
    expect(result.ok).toBe(false);
    if (result.ok || result.stage !== "mark") throw new Error("wrong stage");
    expect(result.annotation.id).toBe(ID);
    expect(result.message).toMatch(/changed/i);
    expect(markedText(editor, ID)).toBe("");
  });

  it("refuses an empty selection and a blank statement before any write", async () => {
    const editor = mount("Hello world");
    const api = fakeApi();
    const empty = await addClaimFlow(api, {
      editor,
      ...base,
      statement: "stmt",
      range: { from: 3, to: 3 },
    });
    expect(empty).toMatchObject({ ok: false, stage: "empty-selection" });
    const blank = await addClaimFlow(api, {
      editor,
      ...base,
      statement: "   ",
      range: { from: 1, to: 6 },
    });
    expect(blank).toMatchObject({ ok: false, stage: "invalid" });
    expect(api.add).not.toHaveBeenCalled();
  });

  it("uses a generated id when none is given", async () => {
    const editor = mount("Hello world");
    const api = fakeApi({
      add: vi.fn(async (_p, _r, input) => ({ ...claim(), id: input.id })),
    });
    const result = await addClaimFlow(api, {
      editor,
      ...base,
      statement: "s",
      range: { from: 1, to: 6 },
    });
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(markedText(editor, result.annotation.id)).toBe("Hello");
  });
});

describe("update flows (non-optimistic)", () => {
  it("status update returns the stored annotation on success", async () => {
    const api = fakeApi({ update: vi.fn(async () => claim("verified")) });
    const result = await updateClaimStatusFlow(api, {
      ...base,
      annotationId: ID,
      status: "verified",
    });
    expect(result).toEqual({ ok: true, annotation: claim("verified") });
    expect(api.update).toHaveBeenCalledWith("p", "r", ID, {
      status: "verified",
    });
  });

  it("a failed update returns the error and no annotation to display", async () => {
    const api = fakeApi({
      update: vi.fn(async () => {
        throw new Error("locked");
      }),
    });
    const result = await updateClaimStatusFlow(api, {
      ...base,
      annotationId: ID,
      status: "disputed",
    });
    expect(result).toEqual({ ok: false, stage: "write", message: "locked" });
    expect("annotation" in result).toBe(false);
  });

  it("refuses a status off the list without a write", async () => {
    const api = fakeApi();
    const result = await updateClaimStatusFlow(api, {
      ...base,
      annotationId: ID,
      status: "bogus" as never,
    });
    expect(result).toMatchObject({ ok: false, stage: "invalid" });
    expect(api.update).not.toHaveBeenCalled();
  });

  it("link and unlink send only a target; null clears the link", async () => {
    const api = fakeApi();
    const target = { sourceId: ID };
    await updateClaimTargetFlow(api, { ...base, annotationId: ID, target });
    await updateClaimTargetFlow(api, {
      ...base,
      annotationId: ID,
      target: null,
    });
    expect(api.update).toHaveBeenNthCalledWith(1, "p", "r", ID, { target });
    expect(api.update).toHaveBeenNthCalledWith(2, "p", "r", ID, {
      target: null,
    });
  });

  it("statement update refuses a blank statement and reports a failed write", async () => {
    const api = fakeApi({
      update: vi.fn(async () => {
        throw new Error("nope");
      }),
    });
    const blank = await updateClaimStatementFlow(api, {
      ...base,
      annotationId: ID,
      statement: " ",
    });
    expect(blank).toMatchObject({ ok: false, stage: "invalid" });
    expect(api.update).not.toHaveBeenCalled();
    const failed = await updateClaimStatementFlow(api, {
      ...base,
      annotationId: ID,
      statement: "new",
    });
    expect(failed).toEqual({ ok: false, stage: "write", message: "nope" });
  });

  it("uses a fallback message for a non-Error rejection", async () => {
    const api = fakeApi({
      update: vi.fn(async () => {
        throw "x";
      }),
    });
    const result = await updateClaimStatementFlow(api, {
      ...base,
      annotationId: ID,
      statement: "new",
    });
    expect(result).toMatchObject({ ok: false, stage: "write" });
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });
});

describe("statuses", () => {
  it("no flow reads or writes config.statuses", () => {
    const src = readFileSync("src/lib/claim-flows.ts", "utf8");
    expect(src).not.toMatch(/config\.statuses|selectActiveProjectStatuses/);
  });
});
