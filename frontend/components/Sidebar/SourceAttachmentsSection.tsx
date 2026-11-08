/**
 * The metadata sidebar's Attachments section (Feature 102). Since Feature 103
 * Task 20 it is the same component as the Sources view's attachments panel
 * (one component, one list-reading hook); this file keeps the sidebar's
 * import path. The sidebar ignores the Sources module switch (OQ-13).
 */
export { default } from "../Sources/SourceAttachmentsPanel";
