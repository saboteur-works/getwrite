---
name: getwrite-api-route
description: >
    Create Next.js App Router API routes for the GetWrite project that follow
    the project's filesystem-backed, no-database architecture: typed request/
    response interfaces, consistent error handling, file locking for concurrent
    writes, and proper use of the model layer in src/lib/models/.
when-to-use: >
    Use this skill whenever the user asks to add, create, or build a new API route or endpoint
    in GetWrite — including "add a route for X", "create an endpoint that does Y",
    "I need an API that Z", or any request that results in a new route.ts file
    under frontend/app/api/. Also use when an existing route needs a new HTTP
    verb handler added to it.
license: MIT
compatibility: >
    Requires Node 24 and pnpm. Run typecheck from frontend/ with
    `pnpm typecheck`. Routes live under frontend/app/api/ and are served by
    Next.js App Router.
metadata:
    author: saboteur-labs
    version: "1.0"
    context-budget: medium
    interfaces: ide, cli
---

# getwrite-api-route

You are adding an API route to the GetWrite writing workspace. GetWrite has no database — everything reads from and writes to the local filesystem. Every route decision flows from that constraint.

---

## Step 1: Survey before writing

Before creating any file:

1. **Find the closest existing route and read it.** Look in `frontend/app/api/` for a route that operates on the same resource or uses the same pattern (write-to-project.json, dynamic segment, multi-action POST, etc.). Reading it takes 30 seconds and gives you the exact import paths, error shape, locking pattern, and JSDoc style used by the file that will sit next to yours. The revision route (`resource/revision/[resource-id]/route.ts`) is the most complete example of all patterns combined.

2. **Check `frontend/src/lib/models/`** for existing helpers. Look for: `sidecar.ts` (resource metadata reads/writes), `revision.ts` (version history), `tags.ts` (project-scoped tags), `trash.ts` (soft delete), `resource-persistence.ts` (resource CRUD), `backlinks.ts`, `project-config.ts`. Use these; don't re-implement filesystem logic inline.

3. **Check `frontend/app/api/`** to confirm the route doesn't already exist and to get the correct directory depth for relative import paths (the depth determines how many `../` hops reach `src/lib/models/`).

4. **Check `frontend/src/lib/models/schemas.ts`** — if your route persists data, check whether a Zod schema already covers it. Use existing schemas to validate data at the persistence boundary, not the request boundary.

---

## Step 2: Determine the route shape

Clarify before writing:

- **Route path** — `frontend/app/api/<path>/route.ts` or `frontend/app/api/<path>/[param]/route.ts`
- **HTTP verbs** — which handlers are needed (GET / POST / PATCH / DELETE)
- **Request shape** — body fields for POST/PATCH/DELETE; query params for GET
- **Response shape** — success payload; error payload
- **Writes?** — does this route write to files that another request might be writing concurrently? If yes, locking is required.

If the verb is ambiguous: GET = read, POST = create or multi-action, PATCH = update, DELETE = remove.

---

## Step 3: Write the route

**File:** `frontend/app/api/<path>/route.ts`

### Module header

Every route gets a `@module` JSDoc comment at the top:

```ts
/**
 * @module app/api/<path>/route
 *
 * One-line description of what this route does.
 *
 * Route:
 * - `GET /api/<path>` — description
 * - `POST /api/<path>` — description
 *
 * GET query params / POST expected body / Success payload / Failure payload
 */
```

### Imports

```ts
import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
// model layer helpers as needed
```

### TypeScript requirements

- Define a named interface for every request body and every response shape — no inline object types, no `any`
- Explicit return type on every exported handler: `Promise<NextResponse<SuccessType | ErrorType>>`
- Never use `as any` or `@ts-ignore` — if the type is unclear, look at `types.ts` in the models directory

### Request body typing

Named interfaces at the top of the file:

```ts
interface CreateFooBody {
    projectPath: string; // always: absolute path to project root
    name: string;
    // ...
}

interface CreateFooResponse {
    foo: Foo;
}

interface ErrorResponse {
    error: string;
    details?: string;
}
```

### Handler structure

```ts
export async function POST(
    req: NextRequest,
): Promise<NextResponse<CreateFooResponse | ErrorResponse>> {
    let body: CreateFooBody;
    try {
        body = (await req.json()) as CreateFooBody;
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400 },
        );
    }

    const { projectPath, name } = body;

    if (!projectPath || typeof projectPath !== "string") {
        return NextResponse.json(
            { error: "Missing required field: projectPath." },
            { status: 400 },
        );
    }

    try {
        const foo = await createFoo(projectPath, name);
        return NextResponse.json({ foo }, { status: 201 });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Operation failed.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
```

### Dynamic params (route segments like `[resource-id]`)

```ts
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ "resource-id": string }> },
) {
    const resourceId = (await params)["resource-id"];
    // ...
}
```

### GET routes — query params and caching

```ts
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const projectPath = searchParams.get("projectPath");

    if (!projectPath) {
        return NextResponse.json(
            { error: "Missing required query param: projectPath." },
            { status: 400 },
        );
    }
    // ...
}

// Required for GET routes that read from the filesystem — prevents Next.js
// from caching the response:
export const dynamic = "force-dynamic";
```

### File locking — when and how

Use `acquireLock` from `src/lib/models/locks.ts` when the route writes to a file that could be written concurrently (e.g., `project.json`, resource content files, sidecar files). Reads don't need locks.

```ts
import { acquireLock } from "../../../../src/lib/models/locks";

const release = await acquireLock(projectPath);
try {
    await fs.writeFile(/* ... */);
} finally {
    release();
}
```

The lock key is typically the project path. For resource-specific writes, use `${projectPath}:${resourceId}`.

Routes that don't need locking: read-only GET handlers, operations on separate files per resource (each resource's files are isolated), or operations where Next.js request isolation already prevents conflicts.

### Multi-action pattern

For routes that logically group related operations under one endpoint (like the tags route):

```ts
type RequestBody = ListFoosBody | CreateFooBody | DeleteFooBody;

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as RequestBody;

        if (body.action === "list") {
            /* ... */
        }
        if (body.action === "create") {
            /* ... */
        }
        if (body.action === "delete") {
            /* ... */
        }

        return NextResponse.json(
            {
                error: "Invalid action",
                details: "Expected 'list', 'create', or 'delete'",
            },
            { status: 400 },
        );
    } catch (error) {
        return NextResponse.json(
            { error: "Operation failed", details: (error as Error).message },
            { status: 500 },
        );
    }
}
```

### Projects directory resolution

Any route that needs to locate the projects root:

```ts
const resolveProjectsDir = () =>
    process.env.GETWRITE_PROJECTS_DIR ??
    path.join(process.cwd(), "..", "projects");
```

### Status codes

| Situation                                | Status                    |
| ---------------------------------------- | ------------------------- |
| Successful read                          | 200                       |
| Successful create                        | 201                       |
| Successful update / operation            | 200                       |
| Successful delete                        | 200 (with deleted entity) |
| Missing required field or invalid action | 400                       |
| Entity not found                         | 404                       |
| Filesystem / logic failure               | 500                       |

Map "not found" errors from the model layer: if `error.message.includes("not found")` → 404, else → 500.

---

## Step 4: Typecheck

From `frontend/`:

```bash
pnpm typecheck
```

Fix all errors. No `@ts-ignore`, no `any`, no suppressed diagnostics.

---

## Checklist

- [ ] `@module` JSDoc at the top with route, body, and response documented
- [ ] Named interfaces for every request body and response shape
- [ ] No `any` types
- [ ] Explicit return type on every handler: `Promise<NextResponse<Success | Error>>`
- [ ] JSON parse errors caught and return 400
- [ ] Required fields validated with explicit 400 responses
- [ ] Model layer helpers used — no inline filesystem logic that duplicates `src/lib/models/`
- [ ] `acquireLock` used for concurrent-write paths; `release()` called in `finally`
- [ ] `export const dynamic = "force-dynamic"` on GET routes that read the filesystem
- [ ] Status codes match the table above
- [ ] `pnpm typecheck` passes
