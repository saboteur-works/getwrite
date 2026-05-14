# GetWrite Redux Patterns — Annotated Reference

This file contains annotated excerpts from the real codebase showing the canonical form of each pattern. Read it when you need to verify exact TypeScript signatures, naming conventions, or import paths.

---

## The three-layer architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Component / Hook                                               │
│  dispatch(loadItemsForSelectedResource({ resourceId }))         │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  Slice (yourDomainSlice.ts)                                     │
│  - createAsyncThunk: orchestrates context check + transport     │
│  - createSlice: reducers, extraReducers, initialState           │
│  - selectors: select from RootState                             │
└────────────────┬────────────────────────────┬───────────────────┘
                 │ resolveContext()            │ result → state
                 │                            │
┌────────────────▼────────────────────────────────────────────────┐
│  Transport Service (yourDomain-transport-service.ts)            │
│  - resolveYourDomainRequestContext(): RootState → context | err │
│  - fetchItems(context): Promise<ApiResponse>                    │
│  - createItem(context, data): Promise<Item>                     │
│  No Redux Toolkit imports except `RootState` type               │
└─────────────────────────────────────────────────────────────────┘
                 │ pure functions (no state)
┌────────────────▼────────────────────────────────────────────────┐
│  Guards (yourDomain-guards.ts)                                  │
│  applyCanonicalItem(items, id): items    ← called from reducers │
│  isStaleResponse(currentId, responseId): boolean                │
│  Only create this file for complex invariants                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Context resolver — exact signature

Source: `revision-transport-service.ts`

```typescript
export interface RevisionRequestContext {
    projectPath: string;
    resourceId: string;
}

export function resolveRevisionRequestContext(
    state: RootState,
    expectedResourceId: string,
): RevisionRequestContext | { error: string } {
    const selectedProjectId = state.projects.selectedProjectId;
    const selectedResourceId = state.resources.selectedResourceId;

    if (!selectedProjectId) {
        return { error: "No project selected." };
    }

    if (!selectedResourceId || selectedResourceId !== expectedResourceId) {
        return { error: "Selected resource changed before revisions updated." };
    }

    const project = state.projects.projects[selectedProjectId];

    if (!project?.rootPath) {
        return { error: "Selected project is missing a root path." };
    }

    return {
        projectPath: project.rootPath,
        resourceId: selectedResourceId,
    };
}
```

Key points:
- Returns a union type, never throws
- Validates `selectedResourceId === expectedResourceId` — this is the early stale check
- Caller checks `"error" in context` to branch

---

## Async thunk — exact generic slots

Source: `revisionsSlice.ts`

```typescript
export const loadRevisionsForSelectedResource = createAsyncThunk<
    LoadRevisionsResult,      // ← fulfilled payload type
    ResourceScopedPayload,    // ← thunk argument type
    { state: RootState; rejectValue: string }  // ← thunk options
>(
    "revisions/loadRevisionsForSelectedResource",
    async ({ resourceId }, thunkApi) => {
        const context = resolveRevisionRequestContext(
            thunkApi.getState(),
            resourceId,
        );

        if ("error" in context) {
            return thunkApi.rejectWithValue(context.error);
        }

        try {
            const data = await fetchRevisionList(context);
            const revisions = parseRevisionEntries(data);

            return {
                resourceId,
                revisions,
                currentRevisionId: resolveCurrentRevisionId(revisions),
            };
        } catch (error) {
            return thunkApi.rejectWithValue(
                getErrorMessage(error, "Unable to load revisions."),
            );
        }
    },
);
```

The `{ state: RootState; rejectValue: string }` generic is what makes `thunkApi.getState()` typed and `thunkApi.rejectWithValue()` accept a string. Without it both those calls lose types.

---

## extraReducers — stale detection patterns

Source: `revisionsSlice.ts`

### List-load thunk (dual-ID stale tracking)

```typescript
builder.addCase(loadRevisionsForSelectedResource.pending, (state, action) => {
    state.requestedResourceId = action.meta.arg.resourceId;  // capture the target
    state.isLoading = true;
    state.errorMessage = "";
});

builder.addCase(loadRevisionsForSelectedResource.fulfilled, (state, action) => {
    // Reject if a different resource became active while we were loading
    if (state.requestedResourceId !== action.payload.resourceId) {
        return state;
    }

    state.resourceId = action.payload.resourceId;
    state.requestedResourceId = null;
    state.revisions = action.payload.revisions;
    state.isLoading = false;
    return state;
});

builder.addCase(loadRevisionsForSelectedResource.rejected, (state, action) => {
    // In rejected, use action.meta.arg — NOT action.payload
    if (state.requestedResourceId !== action.meta.arg.resourceId) {
        return state;
    }

    state.requestedResourceId = null;
    state.isLoading = false;
    state.errorMessage = action.payload ?? "Unable to load revisions.";
    return state;
});
```

### Per-item delete thunk (ID-flag stale tracking)

```typescript
builder.addCase(deleteRevisionForSelectedResource.pending, (state, action) => {
    state.deletingRevisionId = action.meta.arg.revisionId;  // which item
    state.errorMessage = "";
});

builder.addCase(deleteRevisionForSelectedResource.fulfilled, (state, action) => {
    if (state.resourceId !== null && state.resourceId !== action.payload.resourceId) {
        return state;
    }

    state.revisions = removeRevisionEntry(state.revisions, action.payload.revisionId);
    state.deletingRevisionId = null;
    // Side effect: if we deleted the currently viewed revision, pick a new one
    if (state.currentRevisionId === action.payload.revisionId) {
        state.currentRevisionId = resolveCurrentRevisionId(state.revisions);
        state.currentRevisionContent = null;
    }
    return state;
});

builder.addCase(deleteRevisionForSelectedResource.rejected, (state, action) => {
    if (state.deletingRevisionId !== action.meta.arg.revisionId) {
        return state;
    }
    state.deletingRevisionId = null;
    state.errorMessage = action.payload ?? "Failed to delete revision.";
    return state;
});
```

---

## Cross-slice subscription

Source: `revisionsSlice.ts`

```typescript
// At the top of extraReducers, before any thunk cases:
builder.addCase(setSelectedResourceId, (state, action) => {
    // Don't reset if the user re-selected the same resource
    if (state.resourceId === action.payload) {
        return state;
    }
    resetRevisionState(state);
    return state;
});
```

This listens to an action exported from `resourcesSlice`. When the user switches resources, revision state auto-resets so stale data doesn't appear for the new resource. Import the action at the top of the slice file: `import { setSelectedResourceId } from "./resourcesSlice";`

---

## Guard functions — canonical invariant

Source: `revision-canonical-guards.ts`

```typescript
// Returns a new array where exactly one item has isCanonical: true
export function applyCanonicalRevision(
    revisions: RevisionEntry[],
    canonicalId: string,
): RevisionEntry[] {
    return revisions.map((revision) => ({
        ...revision,
        isCanonical: revision.id === canonicalId,
    }));
}

// Returns true if the fulfilled response is for a resource we've moved away from
export function isStaleCanonicalUpdate(
    currentResourceId: string | null,
    updateResourceId: string,
): boolean {
    return currentResourceId !== null && currentResourceId !== updateResourceId;
}
```

Guards are called from both sync reducers and extraReducers. They never read or write Redux state directly.

---

## Memoized selector with guarded output

Source: `revisionsSlice.ts`

```typescript
// Private input selectors
const selectRevisionsState = (state: RootState): RevisionsState =>
    state.revisions;

const selectSelectedResourceId = (state: RootState): string | null =>
    state.resources.selectedResourceId;

// Guard: only return revisions when they match the currently selected resource
export const selectVisibleRevisions = createSelector(
    [selectRevisionsState, selectSelectedResourceId],
    (revisionsState, selectedResourceId) => {
        if (
            !selectedResourceId ||
            revisionsState.resourceId !== selectedResourceId
        ) {
            return [];  // ← empty, not the stale data
        }
        return revisionsState.revisions;
    },
);
```

The guard in `createSelector` prevents stale revision data from showing during navigation transitions — the slice might still have the old resource's data while the new resource is loading.

---

## Normalization type guard pattern

Source: `revision-normalization.ts`

```typescript
// Type guard used when parsing an unknown API response
export function isRevision(value: unknown): value is Revision {
    return (
        !!value &&
        typeof value === "object" &&
        "id" in value &&
        "resourceId" in value &&
        "versionNumber" in value &&
        "createdAt" in value &&
        "filePath" in value &&
        "isCanonical" in value
    );
}

// Parses an API payload safely — never throws, returns [] on bad input
export function parseRevisionEntries(payload: unknown): RevisionEntry[] {
    if (!payload || typeof payload !== "object") return [];

    const rawRevisions =
        "revisions" in payload
            ? (payload as { revisions?: unknown }).revisions
            : payload;

    if (!Array.isArray(rawRevisions)) return [];

    return sortRevisionsDescending(
        rawRevisions
            .filter(isRevision)
            .map((revision) => toRevisionEntry(revision)),
    );
}
```

---

## Store.ts registration

Source: `store.ts`

```typescript
// Both the deprecated singleton and the factory must include the new reducer
export const makeStore = () => {
    return configureStore({
        reducer: {
            projects: projectsReducer,
            resources: resourcesReducer,
            revisions: revisionsReducer,
            editorConfig: editorConfigReducer,
            yourDomain: yourDomainReducer,  // ← add here
        },
    });
};

// RootState derives from makeStore — new slice is automatically included
export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
```

---

## API error extraction helper

Both the slice and the transport service use a slightly different version of this helper. The **slice** version extracts from `Error` instances (thrown by transport functions):

```typescript
// In the slice file — for errors thrown by transport functions
function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }
    return fallback;
}
```

The **transport service** version extracts structured errors from API response bodies:

```typescript
// In the transport service — for non-ok HTTP responses
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

Both live in their respective files. The transport service throws `new Error(getApiErrorMessage(...))`, and the slice's thunk catch block uses `getErrorMessage(error, fallback)` to unwrap it.
