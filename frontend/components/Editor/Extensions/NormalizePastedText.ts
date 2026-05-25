import { Extension } from "@tiptap/core";
import { normalizePastedHTML } from "./NormalizePastedHTML";

const NormalizePastedText = Extension.create<{
  bodyFontSize: string | undefined;
}>({
  name: "normalizePastedText",

  addOptions() {
    return { bodyFontSize: undefined };
  },

  transformPastedHTML(html) {
    return normalizePastedHTML(html, this.options.bodyFontSize);
  },
});

export default NormalizePastedText;
