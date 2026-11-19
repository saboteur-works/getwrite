# Task 28: wording review of the split texts (LEAD/OWNER)

The owner reviewed the texts on 2026-11-17 and the lead recorded the decisions.

## How the review was run

The lead listed every user-visible Feature 120 text, about 75 of them, with ids A1 to H14, in a review sheet. The sheet was in the session scratchpad and is not committed. It covered:

- the dialog, menu and palette labels;
- the split refusals, notices, failures and their step and state labels;
- the split host's texts;
- the Undo refusals, progress, success, failure and index texts.

The lead flagged six texts with a reason, so the owner could look at them:

- B12, step failed: it points at another message instead of saying what happened.
- C3 and G12, index failure: they name `reindex`, which is a CLI command with no button in the app.
- D12, state unknown: the word order is awkward.
- G5 and G6, invalid request and transport failure: they use the word "request".

The owner saw the texts as a list, not in the running app.

## Decision

- Every text is **kept as drafted**: 2026-11-17, the owner. That includes the six flagged texts.
- No text was changed and none is left unreviewed.

## Where the texts live (owner decision, 2026-11-17)

Before this task, the drafted texts were in three places:

- `split-messages.ts`;
- `components/Split/splitUndoMessages.ts` (Undo, from Task 32);
- constants in `components/Split/SplitHost.tsx` (Task 25).

The owner chose to move them all into `frontend/src/lib/models/split-messages.ts`. The move changes no wording. The dialog's own labels (A4 to A13) stay in `SplitDialog.tsx`.

## Related owner decision, same session

A project root given as a relative path makes the split lock key refuse with `SplitLockKeyError` (Task 23 finding). The owner chose to accept this and document it as a known limit. Every shipped setup sets an absolute root. Only a hand-set relative `GETWRITE_PROJECTS_DIR` or `GETWRITE_DATA_ROOT` reaches the refusal, and both routes return a typed failed body.
