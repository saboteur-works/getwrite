# Feature Spec: Remove Locked Metadata

## Overview

GetWrite injects six locked, unremovable metadata fields into every text resource — Synopsis, Notes, POV, Story Date, Duration, and Story End Date — via `DEFAULT_METADATA_SCHEMA`. Their `locked: true` flag stops users from removing, renaming, or repurposing them, even when a project is poetry, an article, or any work with no point-of-view or chronology. This forces a novel-shaped data model onto every project and contradicts GetWrite's principle that metadata should be user-driven. It is complicated by two hard dependencies: the Timeline View consumes the story-date fields and POV, and the Organizer card body is hardcoded to the Notes field. This feature makes the fields optional — gating the story fields and POV behind independent opt-ins and decoupling the Organizer card body — without breaking metadata querying, the Timeline, or the Organizer.

## Goals

- No metadata field is forced onto a project the user did not opt into.
- The Timeline story fields and POV become explicit, independent opt-ins.
- The Organizer card body is decoupled from Notes and made user-configurable.
- Existing projects and their stored values survive with no data loss or crashes.
- Metadata querying keeps working for every field — present, disabled, or removed.

## Non-goals

- Redesigning the schema editor, Timeline, or Organizer visuals.
- Adding new metadata field types or query capabilities.
- Reinterpreting user data beyond preserving existing values.
- Changing how user-defined (unlocked) fields already behave.
- Per-resource (vs. per-project) field or card-body configuration.

## User stories

- As a poet, I want to create resources with no Synopsis/Notes/POV/timeline fields so my sidebar matches my workflow.
- As a novelist, I want to opt a project into the Timeline so story-date fields appear and the Timeline View activates.
- As any writer, I want a Timeline that works whether or not I track POV.
- As an Organizer user, I want to choose what each card shows as its body.
- As an existing user, I want my current projects and stored metadata values to keep working unchanged.

## Functional requirements

1. Synopsis and Notes MUST be toggleable per project and default to off for new projects; their dedicated sidebar controls render only when enabled.
2. Story Date, Duration, and Story End Date MUST be gated by a project-level "Timeline" opt-in stored in `ProjectConfig`, off by default for new projects.
3. When the Timeline opt-in is off, the Timeline View MUST be hidden or disabled in the view switcher and MUST NOT render or throw.
4. POV MUST be an independent opt-in, separate from the Timeline; the Timeline View MUST render correctly whether or not POV is present.
5. The Organizer card body source MUST be user-configurable per project — a chosen metadata field, an excerpt of the resource's text content, or none — and MUST NOT be hardcoded to `notes`. When the source is a text-content excerpt, the setting MUST include a configurable length cap.
6. Disabling or removing any field MUST preserve existing sidecar values; the system MUST NOT silently delete stored data.
7. Metadata querying MUST continue to evaluate any field key that still has stored values, including disabled or removed fields.
8. On load, existing projects MUST have `locked` stripped from these built-in fields with all values preserved; the Timeline and POV opt-ins MUST default to on for projects that already contain the corresponding data.
9. The built-in "Story Timeline" group label MUST be renamed to "Timeline".
10. The Timeline, POV, Synopsis, and Notes toggles MUST be stored in `ProjectConfig` and editable from project settings at any time after a project is created.

## Open questions

None identified.

## Out of scope (deferred)

- Prompting the user to activate the Timeline or POV during the project-creation flow — toggles are configured in project settings instead.
- User-configurable POV color palettes in the Timeline.
- Generalizing other built-in groups (Document / Status) into opt-in features.
- Per-resource card-body overrides.
