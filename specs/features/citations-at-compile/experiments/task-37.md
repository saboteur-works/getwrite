# Task 37: OWNER DECISION POINT: OQ-8 PDF note placement

Recorded by the lead on 2026-11-15.

No decision needed: PDF placed each note on its page, per `experiments/task-36.md`.

- Task 36: a two-pass PDF prototype placed 24 of 24 notes on the page of their reference mark, across 6 page breaks. It found pages by test-only text extraction (`pdfjs-dist`, a devDependency).
- Task 57: the construction Task 43 ships uses only shipped dependencies, reading each mark's page from react-pdf's `onRender` layout data. It placed 24 of 24 notes across 7 page breaks, and it needs `lineHeight: 1` on the footer Text; the cause of that is not established.
- The owner then chose the following for Task 43 (Gate 5, 2026-11-15):
  - Task 57's construction;
  - space reserved below the body for notes, uniform across pages (accepted, with pages growing from 12 to 19 on the tall-notes corpus);
  - a bounded re-render (`PDF_NOTE_LAYOUT_MAX_PASSES` 8; 4 passes on the tall-notes corpus).

No fallback to end-of-chapter or end-of-document notes was taken. OQ-8 is therefore settled without an owner choice between fallbacks.
