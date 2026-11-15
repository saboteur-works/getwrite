# Task 9: FR-2 engine and licence decision (OWNER GATE)

Decision given by the owner in the session on 2026-11-15, after reading the Task 8 comparison table (`task-8.md`) and the records it copies (`task-2.md`, `task-4.md`, `task-5.md`, `task-6.md`, `task-7.md`). The owner chose the licence option and confirmed the wording below; the lead transcribed it.

Decision: Hayagriva 0.10.1 (commit `2dbaa50518f4d93b5cfc7f9f65f0a3a8dd66bd04`, compiled to WebAssembly, `wasm-opt -Oz`), taken under Apache-2.0 (licence text and Hayagriva's NOTICE bundled; Hayagriva source unmodified), accepted; Chicago Manual of Style 18th edition notes and bibliography (CSL `chicago-notes-bibliography.csl`, CC BY-SA 3.0, unmodified, author metadata kept) and the en-US locale (`locales-en-US.xml`, CC BY-SA 3.0, translators kept) accepted, crediting the CSL project with a link to citationstyles.org; bundle size of about 2.5 MB raw / 796 KB gzipped per engine copy accepted, with Task 32 loading as few copies as it can; 2026-11-15; by the owner.

## What this settles

- **OQ-1 (engine and licence):** Hayagriva (B) accepted, under Apache-2.0; the Chicago notes and bibliography style (18th edition) and the en-US locale accepted under CC BY-SA 3.0 on the stated conditions.
- **OQ-2 (bundle size):** accepted per engine copy as measured in `task-7.md`; no fixed ceiling, with the instruction that Task 32 loads as few copies as it can.
- **Task 8 licence question Q5** (which Hayagriva option): Apache-2.0, chosen by the owner because GetWrite's own licence (FSL-1.1-ALv2) grants each release under Apache-2.0 on its second anniversary (`LICENSE.md`, "Grant of Future License").
- **Task 8 licence question Q4** (CC BY-SA styles and locale in an FSL product): the owner accepts bundling them unmodified with author and translator metadata kept and the CSL project credited and linked. This is the owner's acceptance, not a legal opinion recorded by the lead.
- **Fallback D** (hand-written formatter): not needed.

## Not settled here

- How the engine is delivered into the repository (vendored build artefacts, a package, or a build step) is not part of this decision; it is raised with the owner before Task 32 starts.
