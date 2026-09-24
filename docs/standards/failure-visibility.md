# Failure Visibility Standard

This document applies when writing a `catch`, a fallback value, a transport
return type, or any code path that can fail and still return something.

GetWrite is a writing tool. The worst thing it can do is show a writer an empty
document and let them type into it, because the first keystroke autosaves that
emptiness over work that was intact on disk. Every serious data-loss bug found
in this codebase so far has had that shape.

**A failure must not render as absence.**

---

## 1. The Rule

A read that FAILED and a read that found NOTHING are different states. Code that
returns the same value for both has destroyed the only information the caller
needed.

Concretely:

- Do not return `null`, `[]`, `{}`, `0`, or `""` for a failure when that same
  value is also a legitimate success result.
- Do not `catch` and substitute an empty collection unless you have first
  narrowed the error to the one benign case you mean to tolerate.
- If a caller cannot tell the two apart, neither can the writer.

## 2. Measured Instances

Each of these shipped, and each was invisible until someone happened to look:

| What the writer saw                                                                   | What had actually happened                                                                                                                           |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| A scaffolded template resource opening blank, then overwritten on the first keystroke | `content.tiptap.json` was `{}`, the response failed validation, `fetchContent` returned `null`, and the loader returned early                        |
| A document emptied by undo, persisted over its only revision                          | The content load sat in the undo stack; autosave wrote the result through the canonical revision                                                     |
| Headings silently becoming body text                                                  | `setParagraphLeading` used `setNode("paragraph", …)`, which CONVERTS blocks rather than setting an attribute                                         |
| A project opening with no resources at all                                            | `loadProjectFromDisk` wrapped its `meta/` read in `catch { metaFilenames = [] }`, swallowing permissions errors — and `ProjectLockedError` with them |
| A release reporting the wrong version to every user                                   | A CI job that pushed the version bump to `main` was rejected by branch protection and failed quietly                                                 |

## 3. What To Do Instead

**Narrow the catch.** Tolerate the specific benign error and rethrow the rest.
`project-loader.ts` tolerates `ENOENT` — a project with no `meta/` directory is
an ordinary new or legacy project — and propagates everything else.

```ts
try {
  metaFilenames = (await readdir(metaDir)) as string[];
} catch (error) {
  if (!isMissingEntryError(error)) throw error;
  metaFilenames = [];
}
```

**Compare against the failure value, not falsiness.** `""` is an empty document;
`null` is a failed read. `if (!content)` conflates them and puts an error in
front of a writer whose document is merely blank.

**Raise the error where it matters, not where it happened.** A failed fetch is
not automatically a problem — `useRevisionContent` reports `"error"` only when a
read failed AND no document arrived from any source, because that combination is
the one that leaves an empty editor a writer can type into. Keying the error on
the fetch alone produced false errors over perfectly populated editors.

**Make the dangerous action unreachable, not merely discouraged.** `EditView`
replaces the editor with an error rather than disabling it. A disabled editor is
a promise; an absent one is a guarantee.

**Say what is safe.** The writer's first question is whether their work is gone.
Answer it in the message: _"Its content is still on disk and has not been
changed."_

## 4. Where This Standard Is Deliberately Not Applied

Degrading to a fallback is correct when the degraded state is **true** and the
caller can act on it:

- `lib/api/` transport sites that degrade to a documented fallback per
  Features 48/50/51 — each reports through `transport-validation.ts` first, so
  the failure is recorded even when the value is substituted.
- `update-check.ts` resolves `{ updateAvailable: false }` on any failure. That
  is honest: it does not claim there is no update, only that none was found, and
  nothing is written as a result.

The distinction is whether the substituted value can be mistaken for content —
and whether anything downstream will WRITE based on it.

## 5. Reviewing For It

These are the mechanical tells. None is automatically wrong; each deserves a
sentence explaining why the degraded value is true:

- a `catch` block that assigns an empty collection
- `?? ""`, `?? []`, `?? {}` on a path that can fail
- a function returning `T | null` where `null` means both "missing" and "failed"
- `if (!value)` where `value` can legitimately be `""` or `0`
- a CI step whose failure does not fail the job (`| head` without `pipefail`, a
  placeholder script, `continue-on-error`)

See also: `docs/standards/security.md` §1 Fail Closed, which is the same
principle applied to permission checks — a security check that cannot determine
permission must deny rather than degrade.
