import { loadResourceContent } from "../tiptap-utils";
import type { ResourceMeta } from "./types";

/** Content loaded for a single resource: its TipTap doc and/or plain text. */
type ResourceContent = Awaited<ReturnType<typeof loadResourceContent>>;

/**
 * Resolve `resourceIds` to text-type resources (preserving the requested
 * order), load each one's content, and map it to a section. Every compile and
 * export route shares this resolve → filter → load pipeline and differs only in
 * the section shape it builds, supplied via `toSection`.
 */
export async function loadTextSections<TSection>(
  projectPath: string,
  resourceIds: string[],
  resources: ResourceMeta[],
  toSection: (meta: ResourceMeta, content: ResourceContent) => TSection,
): Promise<TSection[]> {
  const resourceMap = new Map<string, ResourceMeta>(
    resources.map((r) => [r.id, r]),
  );
  const textIds = resourceIds.filter(
    (id) => resourceMap.get(id)?.type === "text",
  );
  return Promise.all(
    textIds.map(async (id) => {
      const meta = resourceMap.get(id)!;
      const content = await loadResourceContent(projectPath, id);
      return toSection(meta, content);
    }),
  );
}
