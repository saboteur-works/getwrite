import { TipTapDocument, TipTapNode } from "./models";

function extractTextFromNode(node: TipTapNode): string {
  let out = "";
  if ((node as any).text) out += (node as any).text;
  if (node.content) {
    for (const c of node.content) out += extractTextFromNode(c);
  }
  if (node.type === "paragraph" || node.type === "heading") out += "\n";
  return out;
}

/** Convert a TipTap document to plain text. Safe to use in client components. */
export function tiptapToPlainText(doc: TipTapDocument): string {
  return doc.content.map(extractTextFromNode).join("").replace(/\n+$/g, "");
}

/** Convert plain text into a minimal TipTap document (one paragraph per line). Safe to use in client components. */
export function plainTextToTiptap(plain: string): TipTapDocument {
  const lines = plain.split(/\r?\n/);
  const content: TipTapNode[] = lines.map((l) => ({
    type: "paragraph",
    content: l === "" ? [] : [{ type: "text", text: l }],
  }));
  return { type: "doc", content };
}
