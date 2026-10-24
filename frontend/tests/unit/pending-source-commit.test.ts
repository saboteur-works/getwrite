/**
 * note_f13a655b (Markdown source mode): a source edit still waiting out the
 * 400 ms debounce was cancelled on a resource switch and lost. The pending
 * edit now keeps the save of the resource it was typed into.
 */
import { describe, expect, it, vi } from "vitest";
import { createPendingSourceCommit } from "../../components/Editor/pendingSourceCommit";

const convert = (markdown: string) =>
  ({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: markdown }] },
    ],
  }) as never;

describe("createPendingSourceCommit", () => {
  it("sends the latest pending text through the save captured with it", () => {
    const saveA = vi.fn();
    const saveB = vi.fn();
    const pending = createPendingSourceCommit();
    pending.record("first", saveA);
    pending.record("second", saveA);

    // The writer has switched to B; B's save is what the editor has now, but
    // the pending edit was typed into A.
    void saveB;
    expect(pending.flushTo(convert)).toBe(true);

    expect(saveA).toHaveBeenCalledTimes(1);
    expect(saveA).toHaveBeenCalledWith(convert("second"));
    expect(saveB).not.toHaveBeenCalled();
  });

  it("sends nothing after the edit was committed the normal way", () => {
    const save = vi.fn();
    const pending = createPendingSourceCommit();
    pending.record("text", save);
    pending.clear();
    expect(pending.flushTo(convert)).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("sends nothing when the edit had no save (a non-canonical revision)", () => {
    const pending = createPendingSourceCommit();
    pending.record("text", undefined);
    expect(pending.flushTo(convert)).toBe(false);
  });

  it("sends a pending edit only once", () => {
    const save = vi.fn();
    const pending = createPendingSourceCommit();
    pending.record("text", save);
    pending.flushTo(convert);
    expect(pending.flushTo(convert)).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
