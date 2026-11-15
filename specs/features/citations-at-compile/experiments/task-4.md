# Task 4: FR-1 (b) and (f) fidelity run

Run by the lead on 2026-11-14, in the session scratchpad, outside the repo. Nothing was added to GetWrite.

**Candidate pool at the time of this run (owner decisions, 2026-11-14, after Task 2):** citeproc-js is dropped as a shipping candidate; Hayagriva (B) is the only engine candidate, with a hand-written formatter (D) as fallback. citeproc-js is kept only as the **test-only reference processor** for this comparison: installed by the owner into the scratchpad, never added to GetWrite and never distributed. So this record has one candidate column (B) and the reference.

## Setup

- Harness: `scripts/citations-engine-fidelity.mjs` (Task 3, commit `d23969ce`), copied unchanged to `…/scratchpad/engines/a/fidelity.mjs` so that its bare `import("citeproc")` resolves the scratchpad install.
- Reference processor: npm package `citeproc` 2.4.63 (`"license": "CPAL-1.0 OR AGPL-1.0"`), installed by the owner with `npm install --prefix …/scratchpad/engines/a citeproc`.
- Candidate B: the Task 6 WebAssembly build (`pkg-nodejs`), exposed to the harness by a throwaway shim package `hayagriva-wasm` in the scratchpad that exports `renderCitations(items, citations, styleXml, localeXml)` and returns the HTML strings. The shim passes each citation's item id and locator; it passes no suffix, because Hayagriva's `CitationItem` has no suffix field (`task-6.md`).
- Fixture: `scripts/citations-fidelity-fixture.json` (Task 3): 12 items (3 books, 3 journal articles, 3 web pages, 3 interviews), 16 citations, including repeated citations and locators of page, paragraph and line, and timestamps as literal `suffix` text.
- Styles (`styles` commit `3c3995b`): `chicago-notes-bibliography.csl` ("Chicago Manual of Style 18th edition (notes and bibliography)", note class) and `chicago-author-date.csl`. Locale: `locales-en-US.xml` (`locales` commit `14940e5`).
- Normalisation (the harness's): markup tags stripped and whitespace collapsed; nothing else.
- Node v24.15.0. One run per cell.

## Commands and exit codes

```
node fidelity.mjs <citeproc-js|hayagriva> <style> --style-file <style.csl> --locale-file locales-en-US.xml \
  --fixture …/scripts/citations-fidelity-fixture.json --out …/fid-<candidate>-<style>.json
```

| Run | Exit | Differences |
|---|---|---|
| citeproc-js against the reference, notes style (sanity) | 0 | 0 |
| citeproc-js against the reference, author-date style (sanity) | 0 | 0 |
| Hayagriva, notes style | 1 | 10 (6 citations, 4 bibliography positions) |
| Hayagriva, author-date style | 1 | 8 (4 citations, 4 bibliography positions) |

## Every difference, verbatim (normalised text)

### Notes style (`chicago-notes-bibliography`)

| Where | Reference | Hayagriva |
|---|---|---|
| citation c02 | Tove Eriksen, “Drafting **Under** Constraint,” Journal of Composition Studies 14, no. 3 (2017): 210, https://doi.org/10.0000/example.1. | Tove Eriksen, “Drafting **under** Constraint,” … (otherwise identical) |
| citation c06 | …, June 21, 2023, Recorded interview**, at 12:30**. | …, June 21, 2023, Recorded interview. |
| citation c08 | …, February 4, 2021, Telephone interview**, at 1:04:15**. | …, February 4, 2021, Telephone interview. |
| citation c09 | Ilse Castellan, A Field Guide to Revision, ed. Remy Duval (Tern **&#38;** Co., 1998). | … (Tern **&** Co., 1998). |
| citation c13 | …, October 30, 2018, Recorded interview**, at 22:05**. | …, October 30, 2018, Recorded interview. |
| citation c15 | Lindqvist, “Interview with a Local Archivist”**, at 31:10**. | Lindqvist, “Interview with a Local Archivist”. |
| bibliography 2 | Castellan, Ilse. … Tern **&#38;** Co., 1998. | … Tern **&** Co., 1998. |
| bibliography 3 | Eriksen, Tove. “Drafting **Under** Constraint.” … | Eriksen, Tove. “Drafting **under** Constraint.” … |
| bibliography 8 | Writers Reference Desk. “Style Guides Compared.” January 8, 2019. https://example.invalid/style-guides. | (empty) |
| bibliography 11 | (no entry) | Writers Reference Desk. “Style Guides Compared.” January 8, 2019. https://example.invalid/style-guides. |

### Author-date style (`chicago-author-date`)

| Where | Reference | Hayagriva |
|---|---|---|
| citation c06 | (Greta Lindqvist, “Interview with a Local Archivist,” June 21, 2023, Recorded interview**, at 12:30**) | (… Recorded interview) |
| citation c08 | (…, Telephone interview**, at 1:04:15**) | (…, Telephone interview) |
| citation c13 | (…, Recorded interview**, at 22:05**) | (…, Recorded interview) |
| citation c15 | (Lindqvist, “Interview with a Local Archivist”**, at 31:10**) | (Lindqvist, “Interview with a Local Archivist”) |
| bibliography 2 | Castellan, Ilse. 1998. … Tern **&#38;** Co. | … Tern **&** Co. |
| bibliography 3 | Eriksen, Tove. 2017. “Drafting **Under** Constraint.” … | “Drafting **under** Constraint.” … |
| bibliography 8 | Writers Reference Desk. 2019. “Style Guides Compared.” January 8. https://example.invalid/style-guides. | (empty) |
| bibliography 11 | (no entry) | Writers Reference Desk. 2019. … |

### What the differences consist of (grouped, observed)

1. **Timestamps (4 citations in each style):** the reference received the fixture's `suffix` (", at 12:30") and printed it; Hayagriva received no suffix (its `CitationItem` has no suffix field) and printed none. This is an input difference of the probe, not a rendering of the same input.
2. **Title case of "under" (1 citation, 1 bibliography entry):** the reference prints "Drafting Under Constraint", Hayagriva "Drafting under Constraint". The fixture title is "Drafting under Constraint".
3. **Ampersand (1 citation, 1 bibliography entry):** the reference's HTML output carries the entity `&#38;`, Hayagriva's a literal `&`. The harness strips tags, not entities, so this shows as a difference; the displayed character is the same.
4. **Interviews in the bibliography:** the full lists show the reference bibliography has **9 entries** (the three interviews are absent), and Hayagriva's has **12**, with the three interviews present as **empty strings** at positions 8 to 10. The remaining 9 entries are in the same order and, apart from items 2 and 3 above, the same text. The positional comparison therefore reports positions 8 and 11.

Not different: the short form of repeated citations (c03, c14, c16), the page, "para." and "line" labels, note numbering 1 to 16, author-date in-text form, italics of book and journal titles (in markup), and the full stop after the closing quotation mark in c15 (both processors place it there).

## Other FR-1 (f) observations, Hayagriva

- Formatting runs: HTML output carries italics as `<span style="font-style: italic;">` and URLs as `<a href>`; the reference uses `<i>` (from its raw output, before normalisation).
- Locator labels: page gives a bare number in notes ("42") and in author-date ("2011, 42"); paragraph "para. 3"; line "line 118", in both processors.
- Repeated citations: short form, no "Ibid.", in both processors (the 18th-edition Chicago notes style).
- Notes numbered once across the manuscript: yes, note numbers 1 to 16 (OQ-16).
- Bibliography heading: none in Hayagriva's output (OQ-12). The reference's `makeBibliography()` result was not inspected for a heading.
- Interviewee: carried as CSL `author` in the fixture; both processors print the interviewee first and "interview by <interviewer>" (c06).

## Not done here

- Nothing is judged pass or fail; that is the owner's (FR-2).
- Only the two Chicago styles; one run each; Node only (browser, Electron and Android export are Task 5).
