# Task 56: build and vendor the engine (LEAD-RUN)

Run by the lead on 2026-11-14 from the main checkout at commit `d17be42b` (Task 55 source, `6da74eda`). This is the first compile of the Task 55 source.

## Toolchain (owner-installed)

- rustc 1.100.0 (0ef1bc386 2026-11-09), toolchain `stable` via Homebrew `rustup`, target `wasm32-unknown-unknown`.
- wasm-pack 0.15.1 (`~/.cargo/bin`); it installed the `wasm-bindgen` CLI into its own cache during the build.
- wasm-opt version 133 (Homebrew `binaryen`).
- `CARGO_TARGET_DIR` pointed at the session scratchpad, so no `target/` was written under `tools/hayagriva-wasm/`.

## Commands and results

| Step | Command | Where | Result |
|---|---|---|---|
| Type check | `cargo +stable check --target wasm32-unknown-unknown` | sandbox (`CARGO_HOME` in scratchpad) | `Finished`, no errors or warnings in the wrapper |
| Crate tests | `cargo +stable test` (host target) | sandbox | 4 passed, 0 failed: `plain_run_has_no_flags`, `unknown_locator_label_is_refused`, `empty_children_give_no_runs`, `bad_style_names_the_style` |
| Build and vendor | `tools/hayagriva-wasm/build.sh` (`RUSTUP_TOOLCHAIN=stable`) | outside the sandbox | exit 0 in 21 s. A first attempt inside the sandbox failed with wasm-pack "Operation not permitted (os error 1)", with a denied connection to `crates.io:443` |

`build.sh` leaves `tools/hayagriva-wasm/pkg/`, which wasm-pack writes with its own `.gitignore` (`*`), so it is not tracked. `cargo` wrote `tools/hayagriva-wasm/Cargo.lock`, which pins the dependency versions this build used.

## Vendored files (`frontend/src/lib/citations/engine/`)

- `hayagriva_wasm_bg.wasm`: 2,487,469 bytes raw, 797,712 with `gzip -9`, 587,719 with `brotli -q 11`; SHA-256 `6143abff279b1fae738033f14dd2eff89630bfa0e73050d7940b141db542acb0`. (The Task 6 probe was 2,485,125 raw / 795,819 gzip. The wrapper is different, so the two figures are not the same build.)
- `hayagriva_wasm.js` (8,653 bytes) and `hayagriva_wasm.d.ts` (1,921 bytes): the wasm-bindgen glue, web target. It exports `render(style_xml, locale_xml, items_json, citations_json): string`, default `init` and `initSync`.
- `LICENSE-APACHE` and `NOTICE`, copied from the Hayagriva checkout at `2dbaa50518f4d93b5cfc7f9f65f0a3a8dd66bd04`; `cmp` shows each is byte-identical to the source.

No `package.json`, lockfile or workspace file was changed.

## Smoke render in Node

The script is `scratchpad/t56/smoke.mjs`, not committed. It ran on Node v24.15.0 against the vendored files, with `initSync` given the `.wasm` bytes. Inputs were the Task 3 fixture (`scripts/citations-fidelity-fixture.json`, 12 items, 16 citations, note numbers 1 to 16), `chicago-notes-bibliography.csl` (styles `3c3995b`) and `locales-en-US.xml` (locales `14940e5`). Locators labelled `page`, `paragraph` or `line` were passed; the rest were passed as no locator. Results are from one run.

- init 3.7 ms, render 53.0 ms.
- 16 citations and 9 bibliography entries. The three interview items produce no bibliography text and are left out, as Task 55 specifies; Task 6 recorded them as empty entries.
- Run flags seen in this output: `italic`, `link`.
- Selected citations, with italic runs shown as `<i>…</i>`:
  - c01: `Maren Alder, <i>The Rise of the Written Word</i> (Harbor Press, 2011), 42.`
  - c03: `Alder, <i>The Rise of the Written Word</i>, 57.`
  - c04: `Petra Jansen, “A Short History of the Footnote,” The Margin Journal, May 17, 2022, para. 3, https://example.invalid/footnote-history.`
  - c05: `Oskar Brandt and Hana Nakamura, <i>Notes on Quiet Rooms</i>, 2nd ed. (Lantern Books, 2004), line 118.`
  - c06: `Greta Lindqvist, “Interview with a Local Archivist,” interview by Paul Moreau, June 21, 2023, Recorded interview.`
  - c15: `Lindqvist, “Interview with a Local Archivist”.`
  - The text matches the Task 6 probe's output for these citations.
- First bibliography entry: `Alder, Maren. <i>The Rise of the Written Word</i>. Harbor Press, 2011.`
- Error values. Each call threw a JSON string and none returned an empty render:
  - malformed style: `{"error":{"stage":"style",…}}`
  - unknown item id: `{"error":{"stage":"citation","message":"citation 0 names unknown item \"nope\""}}`
  - malformed items: `{"error":{"stage":"items",…}}`
- Node printed `MODULE_TYPELESS_PACKAGE_JSON`: the glue is ESM and `frontend/package.json` has no `"type"`. It is a warning; the module loaded.

## Not done here

- No run in the browser, Electron or the Android export with the vendored files. Task 32 integrates the engine, and Tasks 51 to 53 run it.
- Bold, small-caps, superscript and subscript runs are not exercised by this fixture and style.
- Per the Task 55 report, the wrapper applies a citation's locator to its first item id only, and it ignores the element display (block or indent), so runs carry no line breaks.
