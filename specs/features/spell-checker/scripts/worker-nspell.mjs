// Spike worker: nspell + dictionary-en (Feature 95, Task 6; FR-3, FR-6).
// Dictionary files are fetched from the URLs in the init message (dictionary-en's
// own index.js reads them with node:fs, so it is not imported here).
import NSpell from "../../../../frontend/node_modules/nspell/lib/index.js";
import { installProtocol, tokenize } from "./protocol.mjs";

let spell = null;
const need = () => {
  if (!spell) throw new Error("nspell is not loaded");
  return spell;
};
// nspell takes strings or Node Buffers; a browser has no Buffer, so decode as UTF-8 text.
const text = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed with status ${res.status}`);
  return new TextDecoder("utf-8", { fatal: true }).decode(await res.arrayBuffer());
};
const lookup = (word) => word.replace(/’/g, "'");

installProtocol(self, {
  name: "nspell",
  async load(assets) {
    if (typeof assets.aff !== "string" || typeof assets.dic !== "string") throw new Error("nspell init needs assets.aff and assets.dic URLs");
    const [aff, dic] = await Promise.all([text(assets.aff), text(assets.dic)]);
    spell = NSpell(aff, dic);
  },
  async check(text) {
    const s = need();
    return tokenize(text).filter((t) => !s.correct(lookup(t.word)));
  },
  async suggest(word) {
    return need().suggest(lookup(word));
  },
});
