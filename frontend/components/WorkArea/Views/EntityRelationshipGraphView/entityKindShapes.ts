/**
 * @module entityKindShapes
 *
 * Pure, framework-free geometry for the fixed, non-project-configurable
 * six-shape set the entity relationship graph's kind encoding draws from
 * (Feature 69, FR-1/FR-3/FR-5, OQ-1 resolution): circle, square, diamond,
 * triangle, hexagon, star. No React/DOM dependency — this module only
 * produces SVG `<path>` `d` geometry strings (plus a `circle` shape, which
 * has no `d` equivalent and is flagged separately so a caller can render a
 * native `<circle>` element instead) centered on `(0, 0)`, sized to fit
 * within a caller-supplied bounding radius. Task 8 (canvas rendering) and
 * Task 6 (the customization modal/legend/tooltip) are the intended
 * consumers; this module defines the shared geometry both of them read from,
 * so a shape never has two different outlines depending on where it is
 * drawn.
 *
 * The shape set is intentionally fixed (OQ-1): there is no extension point
 * here for a project to add a seventh shape, and `ENTITY_KIND_SHAPES` is a
 * `Record` over the full `EntityKindShapeName` union specifically so TypeScript
 * enforces that every shape in the union has exactly one geometry definition.
 */

/** The fixed six-shape set FR-1/FR-5 draw from. Not project-configurable. */
export const ENTITY_KIND_SHAPE_NAMES = [
  "circle",
  "square",
  "diamond",
  "triangle",
  "hexagon",
  "star",
] as const;

export type EntityKindShapeName = (typeof ENTITY_KIND_SHAPE_NAMES)[number];

/**
 * One shape's renderable geometry. `circle` has `kind: "circle"` and no `d`,
 * since an SVG `<circle>` element (radius only) is the natural, crisper way
 * to render a circle rather than approximating one with a `<path>`. Every
 * other shape has `kind: "path"` and a `d` string describing a closed
 * polygon centered on `(0, 0)`, suitable for an SVG `<path>` element.
 */
export type EntityKindShapeGeometry =
  | { readonly kind: "circle"; readonly radius: number }
  | { readonly kind: "path"; readonly d: string };

/**
 * Builds the `d` attribute for a regular polygon with `sides` vertices,
 * centered on `(0, 0)`, circumscribed by a circle of the given `radius`,
 * with its first vertex rotated by `rotationRadians` from straight up
 * (`-90deg`/`-pi/2`) — rotation lets a shape (e.g. the square, drawn as a
 * diamond's un-rotated square) point a flat edge or a vertex wherever makes
 * it most visually distinct from its neighbors in the fixed set.
 */
function regularPolygonPath(
  sides: number,
  radius: number,
  rotationRadians = -Math.PI / 2,
): string {
  const points: Array<[number, number]> = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = rotationRadians + (index * 2 * Math.PI) / sides;
    points.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
  }
  return closedPathFromPoints(points);
}

/**
 * Builds the `d` attribute for a five-pointed star, centered on `(0, 0)`,
 * with its outer points on a circle of `outerRadius` and its inner vertices
 * (between points) on a circle of `innerRadius`.
 */
function starPath(outerRadius: number, innerRadius: number): string {
  const points: Array<[number, number]> = [];
  const spikes = 5;
  const step = Math.PI / spikes;
  let angle = -Math.PI / 2;
  for (let index = 0; index < spikes * 2; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    points.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
    angle += step;
  }
  return closedPathFromPoints(points);
}

function closedPathFromPoints(points: ReadonlyArray<[number, number]>): string {
  const [first, ...rest] = points;
  const moveTo = `M ${formatCoordinate(first[0])} ${formatCoordinate(first[1])}`;
  const lineTos = rest
    .map(([x, y]) => `L ${formatCoordinate(x)} ${formatCoordinate(y)}`)
    .join(" ");
  return `${moveTo} ${lineTos} Z`;
}

/** Rounds to avoid long floating-point tails in the rendered `d` string. */
function formatCoordinate(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/**
 * Returns this shape's geometry sized to fit within `boundingRadius` — the
 * same circumscribing radius a circle of that size would use (e.g. the
 * graph canvas's own `NODE_RADIUS`), so every shape reads as roughly the
 * same visual "size" as its neighbors at the node's existing render size
 * despite having a different outline.
 *
 * Each non-circle shape's radius is nudged relative to `boundingRadius` so
 * that shapes with more visual mass per unit radius (e.g. a square's corners
 * versus a circle's edge) don't read as disproportionately larger or smaller
 * than the others — the exact nudges below were chosen by eye for visual
 * balance at a ~16-24px node-icon render size, not derived from a formula.
 */
export function getEntityKindShapeGeometry(
  shape: EntityKindShapeName,
  boundingRadius: number,
): EntityKindShapeGeometry {
  switch (shape) {
    case "circle":
      return { kind: "circle", radius: boundingRadius };
    case "square":
      // Rotated 45deg from a diamond's own un-rotated orientation so the two
      // never share an outline; scaled down slightly since a square's
      // corners reach further than a circle of the same edge-to-edge width.
      return {
        kind: "path",
        d: regularPolygonPath(4, boundingRadius * 0.92, -Math.PI / 4),
      };
    case "diamond":
      return { kind: "path", d: regularPolygonPath(4, boundingRadius, 0) };
    case "triangle":
      return {
        kind: "path",
        d: regularPolygonPath(3, boundingRadius * 1.1, -Math.PI / 2),
      };
    case "hexagon":
      return {
        kind: "path",
        d: regularPolygonPath(6, boundingRadius, -Math.PI / 2),
      };
    case "star":
      return {
        kind: "path",
        d: starPath(boundingRadius * 1.05, boundingRadius * 0.45),
      };
  }
}

/**
 * The fixed shape-set lookup table FR-1/FR-3/FR-5/FR-6 share: one renderable
 * geometry definition per shape, keyed by shape name, sized to a default
 * bounding radius matching the graph canvas's existing node render size
 * (`EntityGraphCanvas.tsx`'s `NODE_RADIUS`, 22 — duplicated here as a literal
 * rather than imported, since this module must stay framework-free and
 * import-free of any React component). A caller needing a different size
 * (e.g. a smaller legend swatch) should call `getEntityKindShapeGeometry`
 * directly rather than scaling this constant's `d` strings post hoc.
 */
const DEFAULT_SHAPE_BOUNDING_RADIUS = 22;

export const ENTITY_KIND_SHAPES: Readonly<
  Record<EntityKindShapeName, EntityKindShapeGeometry>
> = Object.freeze(
  Object.fromEntries(
    ENTITY_KIND_SHAPE_NAMES.map((shape) => [
      shape,
      getEntityKindShapeGeometry(shape, DEFAULT_SHAPE_BOUNDING_RADIUS),
    ]),
  ) as Record<EntityKindShapeName, EntityKindShapeGeometry>,
);

/**
 * FR-5/OQ-3's deterministic unmapped-kind shape assignment: a standard
 * djb2 string hash over the raw `entityKind` string, modulo six (the fixed
 * shape-set size), so the same kind string always resolves to the same
 * fallback shape across reloads, devices, and discovery order — the hash
 * depends only on the string's own characters, never on iteration/insertion
 * order or any other runtime state.
 */
export function hashEntityKindToShapeName(
  entityKind: string,
): EntityKindShapeName {
  // djb2: hash = hash * 33 + charCode, seeded at 5381, per OQ-3's resolution
  // (djb2 or FNV-1a; djb2 chosen here as the simpler of the two to verify by
  // hand). `>>> 0` keeps the running hash an unsigned 32-bit integer so the
  // modulo below is never negative.
  let hash = 5381;
  for (let index = 0; index < entityKind.length; index += 1) {
    hash = (hash * 33 + entityKind.charCodeAt(index)) >>> 0;
  }
  const shapeIndex = hash % ENTITY_KIND_SHAPE_NAMES.length;
  return ENTITY_KIND_SHAPE_NAMES[shapeIndex];
}
