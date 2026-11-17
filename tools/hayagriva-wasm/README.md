# hayagriva-wasm

A small Rust wrapper around [Hayagriva](https://github.com/typst/hayagriva), built to WebAssembly and vendored into `frontend/src/lib/citations/engine/` for Feature 116 (Citations at compile).

It exports one function, `render(style_xml, locale_xml, items_json, citations_json)`. It returns JSON with, per citation, the note number and structured text runs (text plus `italic`, `bold`, `smallCaps`, `superscript`, `subscript` flags and a `link` URL where present), and per bibliography entry the item `key` and its runs (entries with no text are omitted). A failure (style, locale, items or citations that do not parse; a citation naming an unknown item or an unknown locator label; a render failure) is thrown as a JSON string `{"error":{"stage","message"}}`, never an empty render.

Input citations: `[{ "itemIds": ["a"], "locator": { "label": "page", "value": "12" }, "noteNumber": 1 }]`. The optional locator (label `page`, `paragraph` or `line`) applies to the first item id.

## Pinned Hayagriva

Git rev `2dbaa50518f4d93b5cfc7f9f65f0a3a8dd66bd04`, `default-features = false`, `features = ["csl-json"]`.

## Toolchain

- rustc stable with the `wasm32-unknown-unknown` target
- wasm-pack 0.15.1
- binaryen 133 (`wasm-opt`)

## Rebuild

```bash
tools/hayagriva-wasm/build.sh
```

The owner runs this when updating the engine (a new Hayagriva rev or a wrapper change). It runs `wasm-pack build --release --target web`, then `wasm-opt -Oz`, and copies `hayagriva_wasm_bg.wasm`, `hayagriva_wasm.js` and `hayagriva_wasm.d.ts` into `frontend/src/lib/citations/engine/`. The `pkg/` and `target/` directories it creates under this folder are build output and are not checked in.
