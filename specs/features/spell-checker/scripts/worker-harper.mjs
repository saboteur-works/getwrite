// Spike worker: harper.js (Feature 95, Task 6; FR-3, FR-6).
// Runs Harper's LocalLinter inside this dedicated worker. Spelling-type lints
// are the unknown words: kinds "Spelling" and "Typo" (Harper reports "teh" as Typo).
// Offsets are the span values Harper returns; they are not re-based.
import { LocalLinter } from "../../../../frontend/node_modules/harper.js/dist/index.js";
import { binary } from "../../../../frontend/node_modules/harper.js/dist/binary.js";
import { installProtocol } from "./protocol.mjs";

const SPELLING_KINDS = new Set(["Spelling", "Typo"]);
const OPTIONS = { language: "plaintext" };
let linter = null;
const need = () => {
  if (!linter) throw new Error("harper is not loaded");
  return linter;
};
const spellingLints = async (text) => (await need().lint(text, OPTIONS)).filter((l) => SPELLING_KINDS.has(l.lint_kind()));

installProtocol(self, {
  name: "harper",
  async load() {
    linter = new LocalLinter({ binary });
    await linter.setup();
  },
  async check(text) {
    return (await spellingLints(text)).map((l) => ({ word: l.get_problem_text(), start: l.span().start, end: l.span().end }));
  },
  async suggest(word) {
    const lints = await spellingLints(word);
    return lints.length === 0 ? [] : lints[0].suggestions().map((s) => s.get_replacement_text());
  },
});
