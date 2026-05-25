import { z } from "zod";
import type { MetadataValue } from "./types";

// Inline ResourceRef + MetadataValue schemas to avoid a circular import
// with schemas.ts (schemas.ts re-exports this module, so it cannot be
// imported here).
const ResourceRefValueLocal = z.object({
  id: z.string().nullable(),
  name: z.string(),
});

const MetadataValueLocal: z.ZodTypeAny = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.string()),
    z.array(z.number()),
    z.array(z.boolean()),
    z.array(ResourceRefValueLocal),
    ResourceRefValueLocal,
    z.record(z.string(), MetadataValueLocal),
  ]),
);

// ─── Operator enums ────────────────────────────────────────────────────────

export const ComparisonOpSchema = z.enum([
  "eq",
  "ne",
  "lt",
  "gt",
  "gte",
  "lte",
]);
export const TextOpSchema = z.enum(["contains", "matches"]);

// ─── Leaf predicate schemas ────────────────────────────────────────────────

export const ComparisonNodeSchema = z.object({
  op: ComparisonOpSchema,
  field: z.string().min(1),
  value: MetadataValueLocal,
});

export const InNodeSchema = z.object({
  op: z.literal("in"),
  field: z.string().min(1),
  value: MetadataValueLocal,
});

export const ExistsNodeSchema = z.object({
  op: z.literal("exists"),
  field: z.string().min(1),
});

export const TextNodeSchema = z.object({
  op: TextOpSchema,
  field: z.string().min(1),
  value: z.string(),
});

export const LinksToNodeSchema = z.object({
  op: z.literal("linksTo"),
  id: z.string(),
});

export const LinkedFromNodeSchema = z.object({
  op: z.literal("linkedFrom"),
  id: z.string(),
});

// ─── Splice node schemas ───────────────────────────────────────────────────

export const RefNodeSchema = z.object({ op: z.literal("ref"), id: z.string() });

export const ParamNodeSchema = z.object({
  op: z.literal("param"),
  name: z.string().min(1),
});

// ─── Recursive root schema ─────────────────────────────────────────────────

/**
 * Zod validator for the query AST. Uses z.lazy() to support recursive boolean
 * combinators (and/or/not nodes whose children are themselves QueryAST nodes).
 *
 * Node types:
 *   Leaf predicates  — eq, ne, lt, gt, gte, lte, in, exists, contains, matches,
 *                      linksTo, linkedFrom
 *   Combinators      — and, or, not
 *   Splice nodes     — ref (saved query reference), param (template slot)
 */
export const QueryASTSchema: z.ZodTypeAny = z.lazy(() =>
  z.union([
    ComparisonNodeSchema,
    InNodeSchema,
    ExistsNodeSchema,
    TextNodeSchema,
    LinksToNodeSchema,
    LinkedFromNodeSchema,
    z.object({ op: z.literal("and"), children: z.array(QueryASTSchema) }),
    z.object({ op: z.literal("or"), children: z.array(QueryASTSchema) }),
    z.object({ op: z.literal("not"), child: QueryASTSchema }),
    RefNodeSchema,
    ParamNodeSchema,
  ]),
);

// ─── TypeScript types ──────────────────────────────────────────────────────

export type ComparisonOp = z.infer<typeof ComparisonOpSchema>;
export type TextOp = z.infer<typeof TextOpSchema>;

export type ComparisonNode = {
  op: ComparisonOp;
  field: string;
  value: MetadataValue;
};
export type InNode = { op: "in"; field: string; value: MetadataValue };
export type ExistsNode = { op: "exists"; field: string };
export type TextNode = { op: TextOp; field: string; value: string };
export type LinksToNode = { op: "linksTo"; id: string };
export type LinkedFromNode = { op: "linkedFrom"; id: string };

export type AndNode = { op: "and"; children: QueryAST[] };
export type OrNode = { op: "or"; children: QueryAST[] };
export type NotNode = { op: "not"; child: QueryAST };

export type RefNode = { op: "ref"; id: string };
export type ParamNode = { op: "param"; name: string };

export type LeafNode =
  | ComparisonNode
  | InNode
  | ExistsNode
  | TextNode
  | LinksToNode
  | LinkedFromNode;

export type CombinatorNode = AndNode | OrNode | NotNode;
export type SpliceNode = RefNode | ParamNode;

export type QueryAST = LeafNode | CombinatorNode | SpliceNode;
