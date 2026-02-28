"use client";

import type { Editor } from "@tiptap/react";
import { useCurrentEditor, useEditorState } from "@tiptap/react";
import { useMemo } from "react";

/**
 * Hook that provides access to a Tiptap editor instance.
 *
 * Accepts an optional editor instance directly, or falls back to retrieving
 * the editor from the Tiptap context if available. This allows components
 * to work both when given an editor directly and when used within a Tiptap
 * editor context.
 *
 * @param providedEditor - Optional editor instance to use instead of the context editor
 * @returns The provided editor or the editor from context, whichever is available
 */
export function useTiptapEditor(providedEditor?: Editor | null): {
    editor: Editor | null;
    editorState?: Editor["state"];
    canCommand?: (command?: unknown) => boolean;
} {
    const { editor: coreEditor } = useCurrentEditor();
    const mainEditor = useMemo(
        () => providedEditor || coreEditor || null,
        [providedEditor, coreEditor],
    );

    // Provide a small, stable wrapper around the editor's `can` method to
    // avoid exposing TipTap's complex overloads to the UI. Callers can pass any
    // command name/shape and receive a boolean indicating availability.
    const canCommand = (command?: unknown) => {
        try {
            // Cast to any when calling to avoid overload mismatch errors.
            // This intentionally returns false when the editor isn't available.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return !!(mainEditor as any)?.can?.(command as any);
        } catch (_) {
            return false;
        }
    };

    return { editor: mainEditor, editorState: mainEditor?.state, canCommand };
}
