# Task 6: FR-1 (e) Hayagriva to WebAssembly build

Run by the lead on 2026-11-14 in the session scratchpad (`…/scratchpad/engines/`), outside the repo. Nothing was added to GetWrite and no `package.json` was edited. The probe crate is throwaway and is not committed.

## Toolchain (owner-installed)

- `rustup` 1.29.3 (Homebrew), toolchain `stable-aarch64-apple-darwin`, rustc 1.100.0 (0ef1bc386 2026-11-09), target `wasm32-unknown-unknown` (`rustup toolchain install stable --profile minimal --target wasm32-unknown-unknown`, run by the owner).
- `wasm-pack` 0.15.1 (`cargo +stable install wasm-pack`, run by the owner). It installed `wasm-bindgen` CLI 0.2.130 into its cache during the build.
- Cargo registry cache pointed at the scratchpad (`CARGO_HOME=…/scratchpad/cargo-home`), because the command sandbox cannot write `~/.cargo`.

## Source

- Hayagriva at `typst/hayagriva` commit `2dbaa50518f4d93b5cfc7f9f65f0a3a8dd66bd04` (version 0.10.1), see `task-2.md`.
- Hayagriva's README documents a Rust API and the `archive` feature; it documents no WebAssembly build or JavaScript bindings. So there is no "documented build command" for WebAssembly: the bindings below are a throwaway wrapper written for this probe.

## Bindings produced

A wrapper crate (`hayagriva-wasm-probe`, `crate-type = ["cdylib"]`) depending on `hayagriva` with `default-features = false, features = ["csl-json"]`, `wasm-bindgen = "0.2"` and `serde_json`, release profile `opt-level = "s"`, `lto = true`. It exports one function:

`render(style_xml, locale_xml, items_json, cites_json) -> string` (JSON `{ citations: [{ note_number, html, plain }], bibliography: [{ key, html, plain }] }`), built on Hayagriva's `IndependentStyle::from_xml`, `LocaleFile::from_xml`, `BibliographyDriver`, `CitationRequest::new(…, note_number)` and `CitationItem::with_locator`, writing output with `BufWriteFormat::Html` and `BufWriteFormat::Plain`.

## Build

| Step | Command | Result |
|---|---|---|
| Type check for the target | `cargo +stable check --target wasm32-unknown-unknown` | First run: 2 errors, both in the wrapper (a `json::Value` accessor and an `Option<usize>` field). Hayagriva and its dependencies compiled. After fixing the wrapper: `Finished`. |
| Build, browser target | `wasm-pack build --release --target web --out-dir pkg-web` | Wasm and JS glue produced (`hayagriva_wasm_probe.js`, `.d.ts`, `_bg.wasm`); 68 s including dependency compile. The optional `wasm-opt` step failed: "failed to download from https://github.com/WebAssembly/binaryen/releases/download/version_130/binaryen-version_130-arm64-macos.tar.gz". |
| Build, Node target | `wasm-pack build --release --target nodejs --out-dir pkg-nodejs` | Same output and the same `wasm-opt` download failure. |

Warnings printed during the build: "the following packages contain code that will be rejected by a future version of Rust: buf_redux v0.8.4, multipart v0.18.0" (dependencies of the `wasm-bindgen` CLI install, not of the probe).

## Size (unoptimised: `wasm-opt` did not run)

- `hayagriva_wasm_probe_bg.wasm`: 3,937,489 bytes raw; 840,135 bytes with `gzip -9`.
- Same size for both targets. Size inside the GetWrite bundles is Task 7's.

### Optimised (added 2026-11-14, after the owner installed `binaryen` 133 with Homebrew)

`wasm-opt -Oz --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals --enable-reference-types --enable-multivalue <in.wasm> -o opt.wasm` (wasm-opt version 133), exit 0 for both targets.

| Build | Raw bytes | `gzip -9` | `brotli -q 11` |
|---|---|---|---|
| Unoptimised (`wasm-pack` output) | 3,937,489 | 840,135 | 625,316 |
| `wasm-opt -Oz` | 2,485,125 | 795,819 | 585,826 |

The optimised Node build rendered the Task 3 fixture in the notes style with output byte-identical to the unoptimised build's (compared with `cmp`, timing line excluded); one render call took 54.4 ms against 63.1 ms, one run each.

## Input format

- With the `csl-json` feature, Hayagriva implements its `EntryLike` trait for `citationberg::json::Item` (`src/csl/taxonomy.rs`, `#[cfg(feature = "csl-json")] impl EntryLike for citationberg::json::Item`). A CSL-JSON item array is accepted directly with `serde_json::from_str::<Vec<Item>>`; no conversion step.
- Locators are passed as `SpecificLocator(Locator::Page | Paragraph | Line, LocatorPayload::Str(value))`.
- `CitationItem` has fields `entry`, `locator`, `locale`, `hidden`, `purpose`; it has no prefix or suffix field. The fixture's timestamp suffix (`, at 12:30`) was therefore not passed to the engine and does not appear in the output below.

## Output formatting

- `BufWriteFormat::Html` produces inline markup, for example `<span style="font-style: italic;">The Rise of the Written Word</span>` and `<a href="…">…</a>`. `BufWriteFormat::Plain` produces text with no markup. The Rust API also exposes structured output (`ElemChildren` with `Formatting`), not used by this wrapper.
- Whether this markup is usable by GetWrite's PDF and DOCX renderers is not tested here.

## Smoke run in Node (not the fidelity comparison)

Node v24.15.0, `pkg-nodejs`, the Task 3 fixture (`scripts/citations-fidelity-fixture.json`, 12 items, 16 citations), en-US locale (`locales` commit `14940e5`), styles from `styles` commit `3c3995b`. One run each.

| Style | Render time (one call, all 16 citations and the bibliography) | Citations | Bibliography entries |
|---|---|---|---|
| `chicago-notes-bibliography.csl` (18th ed., note) | 63.1 ms | 16, note numbers 1 to 16 | 12, of which the 3 interviews have empty content |
| `chicago-author-date.csl` | 47.5 ms | 16, `note_number` null | 12, of which the 3 interviews have empty content |

Selected output, verbatim (notes style):

- c01 (page 42): `Maren Alder, <i>The Rise of the Written Word</i> (Harbor Press, 2011), 42.`
- c03, a second citation of book-1 (page 57): `Alder, <i>The Rise of the Written Word</i>, 57.`
- c04 (paragraph 3): `… May 17, 2022, para. 3, <a …>…</a>.`
- c05 (line 118): `… 2nd ed. (Lantern Books, 2004), line 118.`
- c06 (interview, timestamp suffix in the fixture): `Greta Lindqvist, “Interview with a Local Archivist,” interview by Paul Moreau, June 21, 2023, Recorded interview.`
- c14, book-1 with no locator: `Alder, <i>The Rise of the Written Word</i>.`
- c15, a second citation of interview-1: `Lindqvist, “Interview with a Local Archivist”.` (the full stop is outside the closing quotation mark)

Author-date style, verbatim: c01 `(Alder 2011, 42)`; c04 `(Jansen 2022, para. 3)`; c06 `(Greta Lindqvist, “Interview with a Local Archivist,” June 21, 2023, Recorded interview)`.

Observed, not explained:

- The three interview items render empty in the bibliography in both styles. The Chicago notes style has interview-specific bibliography branches (`description-interview-bib`, and `source-event-bib` omits event information for interviews). Whether empty output is what the style asks for or an engine difference is for the Task 4 comparison against the reference processor.
- In c15 the full stop follows the closing quotation mark, while in c06 the comma sits inside it. Whether the reference processor does the same is for Task 4.
- No "Ibid." appears; a repeated citation gives the short form (c03, c14, c15, c16).
- Notes are numbered once across the 16 citations (OQ-16).
- The output carries no bibliography heading (the `Rendered` type has `bibliography` items and no heading field) (OQ-12).

## Not done here

- No browser, Electron or Android static-export run (Task 5); only Node.
- No comparison with the reference processor (Task 4).
- No size optimisation (`wasm-opt` did not run), and no size inside GetWrite's bundles (Task 7).
