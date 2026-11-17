#!/usr/bin/env bash
# Builds the Hayagriva wrapper to WebAssembly and vendors it into the frontend.
# Run by the owner when updating the engine. See README.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PKG_DIR="$SCRIPT_DIR/pkg"
DEST_DIR="$REPO_ROOT/frontend/src/lib/citations/engine"

cd "$SCRIPT_DIR"
wasm-pack build --release --target web --out-dir "$PKG_DIR"

# Feature flags as recorded in specs/features/citations-at-compile/experiments/task-6.md.
wasm-opt -Oz \
  --enable-bulk-memory \
  --enable-nontrapping-float-to-int \
  --enable-sign-ext \
  --enable-mutable-globals \
  --enable-reference-types \
  --enable-multivalue \
  "$PKG_DIR/hayagriva_wasm_bg.wasm" -o "$PKG_DIR/hayagriva_wasm_bg.opt.wasm"
mv "$PKG_DIR/hayagriva_wasm_bg.opt.wasm" "$PKG_DIR/hayagriva_wasm_bg.wasm"

mkdir -p "$DEST_DIR"
cp "$PKG_DIR/hayagriva_wasm_bg.wasm" "$DEST_DIR/hayagriva_wasm_bg.wasm"
cp "$PKG_DIR/hayagriva_wasm.js" "$DEST_DIR/hayagriva_wasm.js"
cp "$PKG_DIR/hayagriva_wasm.d.ts" "$DEST_DIR/hayagriva_wasm.d.ts"

echo "Vendored hayagriva_wasm_bg.wasm, hayagriva_wasm.js and hayagriva_wasm.d.ts into $DEST_DIR"
