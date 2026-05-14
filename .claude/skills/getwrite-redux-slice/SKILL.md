---
name: getwrite-redux-slice
description: >
    Creates new Redux slices that match the existing GetWrite patterns
    (projectsSlice, resourcesSlice, revisionsSlice) including typed hooks,
    the transport-service/guards split, and the explicit (no optimistic) sync
    model. Use this skill whenever the user asks to add, create, or build any
    new Redux slice, store feature, state management layer, or async thunk for
    GetWrite — including "add a slice for X", "create Redux state for Y",
    "I need store state that tracks Z", "add async thunk for", "wire up Redux
    for this feature", or any request that results in a new *Slice.ts file in
    frontend/src/store/. Also trigger when an existing slice needs a new async
    thunk, transport function, or guard added to it. The non-standard
    transport-service separation pattern is easy to miss — always use this skill
    rather than improvising.
license: MIT
compatibility: >
    Requires Node 24 and pnpm. Run typecheck from frontend/ with
    `pnpm typecheck`. Store files live in frontend/src/store/.
metadata:
    author: saboteur-labs
    version: "1.0"
    context-budget: medium
    interfaces: ide, cli
---

# getwrite-redux-slice

You are adding a Redux slice to the GetWrite writing workspace. GetWrite uses a three-layer store architecture — the transport service, guard functions, and normalization layer are separated from the slice for testability and to prevent state machines from being tangled with HTTP logic. Understanding why the layers exist helps you place code correctly.

---

## Step 1: Read the existing patterns

Before writing anything, read the most complete example of the pattern: `frontend/src/store/revisionsSlice.ts` and its companion files `revision-transport-service.ts`, `revision-canonical-guards.ts`, and `revision-normalization.ts`. Also read `frontend/src/store/store.ts` and `frontend/src/store/hooks.ts`.

Then ask yourself:

- Does the existing slice you're modelling most closely resemble `revisionsSlice` (complex, async, multiple in-flight operations) or `resourcesSlice` (moderate, mostly sync) or `projectsSlice` / `editorConfigSlice` (simple, sync only)?
- How many concurrent async operations can be in flight simultaneously? Each one that can overlap needs its own loading flag.
- Is there a risk of stale responses? (User navigates away while a request is pending.) If yes, you need dual-ID tracking.

The right answer determines how many files you create.

---

## Step 2: Decide which files to create

**Simple slice (no async):** One file: `frontend/src/store/yourDomainSlice.ts`. See `editorConfigSlice.ts` for the template.

**Slice with async, no stale risk:** Two files: `yourDomainSlice.ts` + `yourDomain-transport-service.ts`. The transport service keeps fetch calls out of the thunk body.

**Full pattern (async + stale risk + derived data):** Three or four files:

- `yourDomainSlice.ts` — state shape, thunks, reducers, selectors
- `yourDomain-transport-service.ts` — pure HTTP functions + context resolver
- `yourDomain-normalization.ts` — API-to-Redux data transforms (only if the API shape differs from what Redux stores)
- `yourDomain-guards.ts` — pure invariant-enforcement functions (only if there are business rules like "only one item may be canonical at a time")

**When is stale risk real?** Ask: could the user switch to a different entity (resource, project) while a request for the current entity is still in-flight? If yes, you need dual-ID tracking. This is almost always the case for entity-scoped loads (loading backlinks for resource A, then the user clicks resource B before the response arrives). It is also true for long-running operations — the longer a request takes, the higher the stale risk.

**When is stale risk low?** Fire-and-forget mutations (create tag, delete file) where the response doesn't contain entity-scoped data you'll render. These don't need `requestedDomainId` because the result payload is just a confirmation. Per-item operations (delete one revision, rename one tag) use the item's own ID as the in-flight flag instead of a domain-scoped ID.

If uncertain, start with the two-file layout and add the extra files if the scope requires them.

---

## Step 3: Define the state shape

Name the interface `YourDomainState`. Key conventions:

```typescript
export interface YourDomainState {
    /** The domain entity whose data is currently loaded. */
    domainId: string | null;
    /**
     * The domain entity currently being requested — used to ignore stale
     * responses if the user navigates to a different entity while loading.
     */
    requestedDomainId: string | null; // only if stale risk exists
    /** Currently loaded items. */
    items: YourItem[];
    /** True while the initial list is loading. */
    isLoading: boolean;
    /** True while a create operation is in flight. */
    isCreating: boolean;
    /** ID of the item currently being deleted, or null. */
    deletingItemId: string | null; // per-item op: null-able ID, not boolean
    /** Latest error surfaced to the UI. Empty string when none. */
    errorMessage: string; // always string, never null
}
```

Rules:

- One `isLoading`-style flag **per distinct concurrent operation** (list load, save, delete are separate)
- Per-item operations (delete one, fetch one) use a nullable ID (`deletingItemId: string | null`) rather than a boolean
- `errorMessage` is always `string`, never `string | null` — initialize to `""`
- Include `domainId` + `requestedDomainId` whenever the loaded state is scoped to a single entity that can change (resource, project)

---

## Step 4: Write the transport service

File: `frontend/src/store/yourDomain-transport-service.ts`

The transport service contains:

**1. Context resolver** — validates Redux state before making any API call:

```typescript
export interface YourDomainRequestContext {
    projectPath: string;
    resourceId: string; // or whatever fields the API needs
}

export function resolveYourDomainRequestContext(
    state: RootState,
    expectedResourceId: string,
): YourDomainRequestContext | { error: string } {
    const { selectedProjectId } = state.projects;
    const { selectedResourceId } = state.resources;

    if (!selectedProjectId) return { error: "No project selected." };
    if (!selectedResourceId || selectedResourceId !== expectedResourceId) {
        return {
            error: "Selected resource changed before operation completed.",
        };
    }

    const project = state.projects.projects[selectedProjectId];
    if (!project?.rootPath)
        return { error: "Selected project is missing a root path." };

    return { projectPath: project.rootPath, resourceId: selectedResourceId };
}
```

**2. Error helper** — shared across all transport functions in this file:

```typescript
function getApiErrorMessage(errorBody: unknown, fallback: string): string {
    if (
        errorBody &&
        typeof errorBody === "object" &&
        "error" in errorBody &&
        typeof (errorBody as { error?: unknown }).error === "string"
    ) {
        return (errorBody as { error: string }).error;
    }
    return fallback;
}
```

**3. One pure async function per API call** — each takes `context` as its first argument, never the Redux `state` directly:

```typescript
export async function fetchYourItems(
    context: YourDomainRequestContext,
): Promise<RawApiResponse> {
    const response = await fetch("/api/your-endpoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            projectPath: context.projectPath,
            resourceId: context.resourceId,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(getApiErrorMessage(errorBody, "Unable to load items."));
    }

    return (await response.json()) as RawApiResponse;
}
```

The transport service imports only `RootState` from the store — it has zero Redux Toolkit dependencies beyond that type import.

---

## Step 5: Write guard and normalization files (if needed)

**Guards** (`yourDomain-guards.ts`) contain pure functions that enforce state invariants:

- Accept and return plain values (no Redux state, no side effects)
- Use immutable patterns — return new arrays/objects, never mutate the input
- Named `applyXxx` (applies a rule) or `isStaleXxx` (returns boolean)

```typescript
// Only create this file when there's a business rule like "exactly one item can be canonical"
export function applyActiveItem(
    items: YourItem[],
    activeId: string,
): YourItem[] {
    return items.map((item) => ({ ...item, isActive: item.id === activeId }));
}

export function isStaleResponse(
    currentDomainId: string | null,
    responseDomainId: string,
): boolean {
    return currentDomainId !== null && currentDomainId !== responseDomainId;
}
```

**Normalization** (`yourDomain-normalization.ts`) contains data transforms between API shapes and Redux shapes:

- Define the Redux-side type separately from the API/persisted type if they differ
- Use type guards (`isYourItem(value: unknown): value is YourItem`) for parsing arrays from API responses
- Provide merge helpers (`mergeItem`, `removeItem`) that return sorted arrays

Only create this file if the API returns a different shape than what Redux should store (e.g., adding a `displayName` field, sorting, or flattening).

---

## Step 6: Write the slice

File: `frontend/src/store/yourDomainSlice.ts`

### Payload interfaces

Define named interfaces for every async thunk's input and return value at the top of the file. Never use inline types in `createAsyncThunk`:

```typescript
interface DomainScopedPayload {
    domainId: string; // matches what the context resolver expects
}

interface LoadItemsResult {
    domainId: string; // always echo back so stale checks work
    items: YourItem[];
}
```

### Async thunk template

Every thunk follows this exact pattern:

```typescript
export const loadItemsForSelectedDomain = createAsyncThunk<
    LoadItemsResult,
    DomainScopedPayload,
    { state: RootState; rejectValue: string }
>("yourDomain/loadItemsForSelectedDomain", async ({ domainId }, thunkApi) => {
    // 1. Validate context first — before any await
    const context = resolveYourDomainRequestContext(
        thunkApi.getState(),
        domainId,
    );
    if ("error" in context) {
        return thunkApi.rejectWithValue(context.error);
    }

    // 2. Call transport, wrap in try/catch
    try {
        const data = await fetchYourItems(context);
        return {
            domainId,
            items: parseItems(data),
        };
    } catch (error) {
        return thunkApi.rejectWithValue(
            getErrorMessage(error, "Unable to load items."),
        );
    }
});
```

Include this local helper in the slice file (not the transport service):

```typescript
function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }
    return fallback;
}
```

### extraReducers template

```typescript
extraReducers: (builder) => {
    // Cross-slice subscription: reset when the user changes context.
    // resetState() should clear domainId, requestedDomainId, loaded data,
    // loading flags, and errorMessage — but NOT purely local UI flags like
    // isOpen (panel visibility) since users find it disorienting if panels
    // close on every navigation event.
    builder.addCase(setSelectedResourceId, (state, action) => {
        if (state.domainId === action.payload) return state;
        resetState(state);
        return state;
    });

    builder.addCase(loadItemsForSelectedDomain.pending, (state, action) => {
        state.requestedDomainId = action.meta.arg.domainId;
        state.isLoading = true;
        state.errorMessage = "";
    });

    builder.addCase(loadItemsForSelectedDomain.fulfilled, (state, action) => {
        // Stale check: ignore if a newer request already replaced our target
        if (state.requestedDomainId !== action.payload.domainId) return state;

        state.domainId = action.payload.domainId;
        state.requestedDomainId = null;
        state.items = action.payload.items;
        state.isLoading = false;
        return state;
    });

    builder.addCase(loadItemsForSelectedDomain.rejected, (state, action) => {
        // Also stale-check rejections
        if (state.requestedDomainId !== action.meta.arg.domainId) return state;

        state.requestedDomainId = null;
        state.isLoading = false;
        state.errorMessage = action.payload ?? "Unable to load items.";
        return state;
    });
};
```

**Critical stale-check rule:**

- Use `state.requestedDomainId !== action.payload.domainId` (payload comparison) in `fulfilled`
- Use `state.requestedDomainId !== action.meta.arg.domainId` (arg comparison) in `rejected` — rejected payloads don't carry domain IDs
- For per-item operations (deleteItem, fetchItemContent): use `state.deletingItemId !== action.meta.arg.itemId` in both `fulfilled` and `rejected`

### No optimistic updates

State in GetWrite is explicit — it only updates when the server confirms. Do not update `state.items` in `.pending` handlers. The only exception is purely local UI state (like which item is currently viewed in a panel) that doesn't reflect server state.

### Selectors

```typescript
export const selectYourDomainState = (state: RootState): YourDomainState =>
    state.yourDomain;

// Guarded selector: only returns data for the currently selected domain
export const selectVisibleItems = createSelector(
    [
        selectYourDomainState,
        (state: RootState) => state.resources.selectedResourceId,
    ],
    (domainState, selectedResourceId) => {
        if (
            !selectedResourceId ||
            domainState.domainId !== selectedResourceId
        ) {
            return [];
        }
        return domainState.items;
    },
);

// Simple flag selectors — one per loading flag
export const selectIsLoadingItems = (state: RootState): boolean =>
    state.yourDomain.isLoading;
export const selectYourDomainError = (state: RootState): string =>
    state.yourDomain.errorMessage;
```

---

## Step 7: Register in store.ts

Add the reducer to both `configureStore` calls in `frontend/src/store/store.ts`:

```typescript
import yourDomainReducer from "./yourDomainSlice";

// In both the deprecated `store` and the `makeStore` factory:
reducer: {
    projects: projectsReducer,
    resources: resourcesReducer,
    revisions: revisionsReducer,
    editorConfig: editorConfigReducer,
    yourDomain: yourDomainReducer,  // ← add here
},
```

`RootState` is derived from `makeStore`, so the type updates automatically — you don't need to touch `RootState` manually.

---

## Step 8: Export and type-check

From the slice file, export:

- The slice actions: `export const { syncAction1, syncAction2 } = yourDomainSlice.actions;`
- The reducer as default: `export default yourDomainSlice.reducer;`
- Any types that consumers need: `export type { YourItem } from "./yourDomain-normalization";`
- All selectors named `select*`

Run typecheck:

```bash
cd frontend && pnpm typecheck
```

Fix all errors before reporting done. The most common issues are:

- Missing `{ state: RootState; rejectValue: string }` in the thunk generic
- Forgetting `rejectValue` forces the thunk's error type to `unknown` instead of `string`
- Using `action.payload` in `.rejected` when the rejection was from context validation (the payload is the rejectValue string, access it via `action.payload`)
- Stale check in `rejected` using `action.payload.domainId` (wrong — use `action.meta.arg.domainId`)

---

## Common mistakes to avoid

**Putting fetch calls in the thunk body.** The thunk should call `resolveContext()` then call transport functions. The reason: transport functions can be tested without Redux, and the thunk body stays readable.

**Forgetting `requestedDomainId`.** If you omit dual-ID tracking for a slice that loads entity-scoped data, rapid navigation (user clicks resource A, immediately clicks resource B) will apply resource A's data to resource B's view. Add dual-ID tracking whenever the loaded state is scoped to an entity the user can switch.

**Using `action.payload` in rejected handlers.** `action.payload` in a rejected case is the rejectValue (a string). Don't try to read `.domainId` from it — use `action.meta.arg.domainId` instead.

**Optimistic state updates.** Don't update the items list in `.pending`. This creates divergence when the request fails and makes rollback complex. The brief loading state is acceptable UX.

**Skipping the context resolver.** Don't inline `state.projects.selectedProjectId` checks directly in thunk bodies. Put them in the context resolver so they're reusable and testable.

**Using `boolean` flags for per-item operations.** `isDeletingItem: boolean` can't tell you _which_ item is being deleted, which means UI can't show a spinner on the right row. Use `deletingItemId: string | null`.

---

## Reference

For detailed annotated examples of each pattern, see `references/patterns.md` in this skill directory.
