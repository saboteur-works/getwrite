# Implementation Tasks: Media View

Derived from `media-view-spec.md`. Granularity: story points (1/2/3/5/8).

---

### Task 1: ImageViewer component (fit + zoom/pan) ✅

**What:** A pure presentational component that renders an image from a `src` URL, scaled to fit its container with zoom (in/out/reset-to-fit) and panning of the zoomed image.
**Files:** `frontend/components/WorkArea/Media/ImageViewer.tsx` (new); `frontend/stories/WorkArea/ImageViewer.stories.tsx` (new)
**Done when:** Given a `src`, the image renders fit-to-container preserving aspect ratio; zoom controls change scale and the zoomed image can be panned; an `onError`/broken `src` renders a clear error state instead of a broken-image element; controls are keyboard-operable with ARIA labels; a Storybook story shows the fit and zoomed states.
**Depends on:** none
**Estimate:** 5
**Notes:** Keep it pure — props are `src`, `alt`, nothing Redux. Covers FRs 4, 5, 11, 12 (image). Zoom/pan interaction (pointer drag + bounds clamping) is the main uncertainty. **shadcn:** no good base — `@shadcn/aspect-ratio` forces a fixed ratio (wrong; FR 4 wants the natural ratio via `object-contain`), and zoom/pan is bespoke. Reuse the existing `common/UI/Button` primitive for the zoom in/out/reset controls.

### Task 2: AudioPlayer component (custom, scrubbable) ✅

**What:** A pure GetWrite-styled audio player with play/pause, a draggable seek bar, and current-time / total-duration display, driven by a `src` URL.
**Files:** `frontend/components/WorkArea/Media/AudioPlayer.tsx` (new); `frontend/stories/WorkArea/AudioPlayer.stories.tsx` (new)
**Done when:** Audio loads from `src`; play/pause toggles playback; the scrub bar seeks to any position and current time updates during playback; total duration displays once known, falling back to an optional `durationSeconds` prop before load; a missing/unreadable `src` shows a clear error state; controls are keyboard-accessible (space/enter play-pause, arrow seek) with ARIA labels; a Storybook story renders the player.
**Depends on:** none
**Estimate:** 5
**Notes:** Wraps a hidden `<audio>` element for decoding/playback but renders custom controls (brand tokens; red reserved for position/canonical only). Covers FRs 7, 9, 10, 11, 12 (audio). Use brand styling per STYLING.md. **shadcn:** use `@shadcn/slider` (Radix Slider, dep `radix-ui`) as the scrubber base — it provides draggable seek, keyboard arrow-seeking, and `role="slider"` ARIA out of the box, removing most of the a11y re-implementation risk. Place it at `common/UI/Slider/Slider.tsx` (PascalCase, matching the existing primitive convention) rather than a raw `shadcn add`, and restyle with brand tokens (keep the filled range neutral unless red is intended as a position indicator). Reuse the existing `common/UI/Button` for play/pause.

### Task 3: MediaView container ✅

**What:** A container that takes the selected media resource, resolves the active project root, builds the file-serving URL, and renders `ImageViewer` or `AudioPlayer` based on resource type.
**Files:** `frontend/components/WorkArea/Media/MediaView.tsx` (new); `frontend/stories/WorkArea/MediaView.stories.tsx` (new)
**Done when:** Given an image resource it renders `ImageViewer`, given an audio resource it renders `AudioPlayer`, each pointed at `GET /api/resource/<id>/file?projectPath=<path>`; audio receives the sidecar `durationSeconds`; a resource with no active project path or unsupported type renders a clear fallback; a Storybook story demonstrates both image and audio.
**Depends on:** Tasks 1, 2
**Estimate:** 2
**Notes:** **Gotcha:** the serving route requires a `projectPath` query parameter — resolve it via `selectActiveProjectRootPath` (as `TipTapEditor` does) and `encodeURIComponent` it. Covers FRs 6, 8, and the routing half of FR 1. **shadcn:** no base needed — pure container/layout plus fallback/error markup.

### Task 4: Render MediaView in the work area for media resources

**What:** Replace the "Selected resource is not a text resource" placeholder so the `edit` view renders `MediaView` when the selected resource is an image or audio resource.
**Files:** `frontend/components/Layout/AppShell.tsx` (the `switch (view)` `case "edit"` block)
**Done when:** With the `edit` view active and an image/audio resource selected, the work area shows `MediaView` (image or player) instead of the text-editor placeholder; selecting a text resource still renders `EditView` unchanged.
**Depends on:** Task 3
**Estimate:** 2
**Notes:** The default `view` is already `"edit"`, so selecting a media resource will route here without any tab interaction. Covers the rendering half of FR 1.

### Task 5: Relabel and enable the Edit tab as "Media" for media resources

**What:** Make the view-switcher's "Edit" tab read "Media" while an image/audio resource is selected, keep that tab enabled for media, and keep non-applicable tabs (Diff) disabled.
**Files:** `frontend/components/WorkArea/ViewSwitcher.tsx`; `frontend/components/Layout/AppShell.tsx` (the `disabledViews` callback)
**Done when:** Selecting an image/audio resource shows the first tab labelled "Media" and enabled; selecting a text resource shows it labelled "Edit"; the Diff tab is disabled for media resources; switching the tab away and back returns to the media view.
**Depends on:** Task 4
**Estimate:** 2
**Notes:** `ViewSwitcher` currently has a static `"Edit"` label in `VIEW_OPTIONS`; add a prop (e.g. `editLabel`) or compute the label from the selected resource type. The current `disabledViews` logic disables `"edit"` for non-text — relax it so image/audio keep `edit` enabled while still disabling `diff`. Covers FRs 2, 3.

---

## Summary

- Total tasks: 5
- Total estimated effort: 16 story points
- Critical path: Tasks 1 → 3 → 4 → 5 (and 2 → 3 → 4 → 5); the two viewer components (1, 2) can be built in parallel, then converge at the container.
- Risks:
  - **Task 1** — zoom/pan pointer interaction and pan-bounds clamping are the highest-uncertainty UI work.
  - **Task 2** — custom scrubber drag + keeping current time synced to the `<audio>` element, plus re-implementing accessibility that native controls would provide for free.
  - **Task 5** — relaxing `disabledViews` and the dynamic label touches shared switcher logic used by all resource types; verify text/folder flows don't regress.
