import { loadResourceContent } from "../tiptap-utils";
import { isLockedAccessError } from "../models/locked-access";
import { readSidecar } from "../models/sidecar";
import { UUID as UuidSchema } from "../models/schemas";
import { validateCitationFields } from "../models/citations-fields-validation";
import { CITATION_FIELDS_KEY } from "../models/citations-types";
import type { CitationSourceInput } from "../models/citations-render";
import type {
  Annotation,
  MetadataValue,
  TipTapDocument,
} from "../models/types";
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
  // A Source is text for compile and export: no built-in rule leaves it out
  // (Feature 102, FR-27); only the writer's saved default does.
  const textIds = resourceIds.filter((id) => {
    const type = resourceMap.get(id)?.type;
    return type === "text" || type === "source";
  });
  return Promise.all(
    textIds.map(async (id) => {
      const meta = resourceMap.get(id)!;
      const content = await loadResourceContent(projectPath, id);
      return toSection(meta, content);
    }),
  );
}

/** One compiled resource as the citations pass reads it (Feature 116, Task 43). */
export interface CitationSectionInput {
  meta: ResourceMeta;
  /** The resource's name as stored in its sidecar; empty when it has none. */
  storedName: string;
  tiptap: TipTapDocument | undefined;
  plainText: string | undefined;
  annotations: Annotation[];
}

/** A read of stored data that failed; `what` is a fixed sentence with no stored content. */
export interface CitationReadFailure {
  ok: false;
  what: string;
}

export type CitationSectionsRead =
  | { ok: true; sections: CitationSectionInput[] }
  | CitationReadFailure;

/** The ids of the text resources a compile includes, in the requested order. */
function compiledTextIds(
  resourceIds: readonly string[],
  resources: readonly ResourceMeta[],
): string[] {
  const types = new Map(resources.map((r) => [r.id, r.type]));
  return resourceIds.filter((id) => {
    const type = types.get(id);
    return type === "text" || type === "source";
  });
}

/**
 * Loads the compiled resources with their TipTap documents and the
 * `annotations` of their sidecars. A sidecar that is missing, cannot be read
 * or has a malformed `annotations` value is a failure, never "no citations"
 * (FR-17). A locked-access error is rethrown unchanged.
 */
export async function loadCitationSections(
  projectPath: string,
  resourceIds: string[],
  resources: ResourceMeta[],
): Promise<CitationSectionsRead> {
  const metas = new Map(resources.map((r) => [r.id, r]));
  const sections: CitationSectionInput[] = [];
  for (const id of compiledTextIds(resourceIds, resources)) {
    const meta = metas.get(id)!;
    let sidecar: Record<string, MetadataValue> | null;
    try {
      sidecar = await readSidecar(projectPath, id);
    } catch (err) {
      if (isLockedAccessError(err)) throw err;
      return {
        ok: false,
        what: "The sidecar of a compiled resource could not be read.",
      };
    }
    if (sidecar === null) {
      return {
        ok: false,
        what: "The sidecar of a compiled resource is missing.",
      };
    }
    const stored: unknown = sidecar.annotations;
    if (stored !== undefined && !Array.isArray(stored)) {
      return {
        ok: false,
        what: "The annotations of a compiled resource could not be read.",
      };
    }
    const content = await loadResourceContent(projectPath, id);
    sections.push({
      meta,
      storedName: typeof sidecar.name === "string" ? sidecar.name : "",
      tiptap: content.tiptap,
      plainText: content.plainText,
      annotations: (stored ?? []) as unknown as Annotation[],
    });
  }
  return { ok: true, sections };
}

export type CitedSourcesRead = {
  sources: Record<string, CitationSourceInput>;
  excerptAnnotationsBySource: Record<string, Annotation[]>;
};

/**
 * Reads each cited Source once. A Source with no sidecar (in Trash or purged)
 * is `removed`; one whose sidecar cannot be read, or whose stored citation
 * fields are not valid, is `unreadable`. A locked-access error is rethrown.
 */
export async function readCitedSources(
  projectPath: string,
  sourceIds: readonly string[],
): Promise<CitedSourcesRead> {
  const sources: Record<string, CitationSourceInput> = {};
  const excerptAnnotationsBySource: Record<string, Annotation[]> = {};
  for (const sourceId of new Set(sourceIds)) {
    const parsed = UuidSchema.safeParse(sourceId);
    if (!parsed.success) {
      sources[sourceId] = { status: "unreadable" };
      continue;
    }
    let sidecar: Record<string, MetadataValue> | null;
    try {
      sidecar = await readSidecar(projectPath, parsed.data);
    } catch (err) {
      if (isLockedAccessError(err)) throw err;
      sources[sourceId] = { status: "unreadable" };
      continue;
    }
    if (sidecar === null) {
      sources[sourceId] = { status: "removed" };
      continue;
    }
    const storedFields: unknown = sidecar[CITATION_FIELDS_KEY];
    const validation =
      storedFields === undefined
        ? undefined
        : validateCitationFields(storedFields);
    if (validation !== undefined && !validation.ok) {
      sources[sourceId] = { status: "unreadable" };
      continue;
    }
    sources[sourceId] = {
      status: "present",
      ...(typeof sidecar.name === "string" ? { name: sidecar.name } : {}),
      citationFields: validation?.value,
    };
    if (Array.isArray(sidecar.annotations)) {
      excerptAnnotationsBySource[sourceId] =
        sidecar.annotations as unknown as Annotation[];
    }
  }
  return { sources, excerptAnnotationsBySource };
}
