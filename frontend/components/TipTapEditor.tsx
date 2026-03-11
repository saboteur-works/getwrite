/**
 * @module TipTapEditor
 *
 * Rich-text editor wrapper around TipTap with project-specific extension setup,
 * math node migration, toolbar integration, and test-environment fallbacks.
 *
 * Key responsibilities:
 * - Configure a consistent extension stack (text style, lists, alignment,
 *   placeholders, IDs, typography, math).
 * - Emit both HTML and TipTap JSON document snapshots on updates.
 * - Keep editor content synchronized when external `value` changes.
 * - Provide deterministic lightweight rendering in test environments.
 */
import "katex/dist/katex.min.css";

import React, { useEffect } from "react";
import {
    useEditor,
    EditorContent,
    EditorContext,
    Content,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TipTapDocument } from "../src/lib/models";
import { MenuBar } from "./Editor/MenuBar/MenuBar";
import {
    TextStyleKit,
    FontSize,
    FontFamily,
} from "@tiptap/extension-text-style";
import Blockquote from "@tiptap/extension-blockquote";
import { BulletList, ListItem } from "@tiptap/extension-list";
import CodeBlock from "@tiptap/extension-code-block";
import Highlight from "@tiptap/extension-highlight";
import UniqueID from "@tiptap/extension-unique-id";
import { Placeholder, Selection } from "@tiptap/extensions";
import Typography from "@tiptap/extension-typography";
import Math, { migrateMathStrings } from "@tiptap/extension-mathematics";
import TextAlign from "@tiptap/extension-text-align";

/**
 * Props accepted by {@link TipTapEditor}.
 */
export interface TipTapEditorProps {
    /**
     * Initial/controlled content provided to TipTap.
     *
     * Accepts any TipTap `Content` shape; when omitted, defaults to empty text.
     */
    value?: Content;
    /**
     * Called whenever editor content changes.
     *
     * @param content - Current editor content serialized as HTML.
     * @param doc - Current TipTap document serialized as JSON.
     */
    onChange?: (content: string, doc: TipTapDocument) => void;
    /** Optional DOM id applied to the `EditorContent` element. */
    id?: string;
    /** When true, disables editing interactions. */
    readonly?: boolean;
}

/**
 * Shared base extension list for all runtime editor instances.
 */
const extensions = [
    StarterKit,
    TextStyleKit,
    FontSize,
    Blockquote,
    BulletList,
    ListItem,
    Highlight,
    CodeBlock.configure({
        enableTabIndentation: true,
    }),
    UniqueID.configure({
        types: ["paragraph", "heading", "blockquote", "codeBlock"],
    }),
    Placeholder.configure({
        placeholder: "Start writing here...",
    }),
    Selection,
    Typography,
    TextAlign.configure({
        types: ["heading", "paragraph"],
    }),
    FontFamily,
];

/**
 * Renders the TipTap editor with toolbar and project-specific behavior.
 *
 * Runtime behavior:
 * - Client-only editor initialization.
 * - Lightweight HTML mock in test environments.
 * - Debounced content synchronization handled by parent consumers.
 * - Math extension click handlers prompt for formula updates.
 *
 * @param props - {@link TipTapEditorProps}.
 * @returns Editor shell, loading placeholders, or test mock depending on
 *   environment and initialization state.
 *
 * @example
 * <TipTapEditor
 *   value={initialHtml}
 *   onChange={(html, doc) => saveDraft(html, doc)}
 *   readonly={false}
 * />
 */
export default function TipTapEditor({
    value = "",
    onChange,
    id,
    readonly = false,
}: TipTapEditorProps) {
    /** True when executing in browser context (guards SSR/hydration paths). */
    const isClient = typeof window !== "undefined";

    /**
     * Test-environment guard used to bypass full ProseMirror lifecycle in jsdom.
     */
    const inTestEnv =
        typeof process !== "undefined" &&
        (process.env?.VITEST === "true" || process.env?.NODE_ENV === "test");

    // During unit tests we avoid initializing TipTap (ProseMirror) because the
    // full editor lifecycle and extension loading can be brittle in jsdom.
    // Return a lightweight mock rendering instead and keep EditView's local
    // state consistent via the `initialContent` prop.
    const editor = useEditor({
        shouldRerenderOnTransaction: true,
        extensions: [
            ...extensions,
            Math.configure({
                blockOptions: {
                    /**
                     * Handles block-math click edits by prompting and updating
                     * the selected node in-place.
                     */
                    onClick: (node, pos) => {
                        const newCalculation = prompt(
                            "Enter new calculation:",
                            node.attrs.latex,
                        );
                        if (newCalculation && editor) {
                            editor
                                .chain()
                                .setNodeSelection(pos)
                                .updateBlockMath({ latex: newCalculation })
                                .focus()
                                .run();
                        }
                    },
                },
                inlineOptions: {
                    /**
                     * Handles inline-math click edits by prompting and updating
                     * the selected inline node.
                     */
                    onClick: (node) => {
                        const newCalculation = prompt(
                            "Enter new calculation:",
                            node.attrs.latex,
                        );
                        if (newCalculation && editor) {
                            editor
                                .chain()
                                .updateInlineMath({ latex: newCalculation })
                                .focus()
                                .run();
                        }
                    },
                },
            }),
        ],
        content: value || "",
        editable: !readonly,
        /**
         * Emits both HTML and JSON representations for parent persistence flows.
         */
        onUpdate: ({ editor }) => {
            if (onChange)
                onChange(editor.getHTML(), editor.getJSON() as TipTapDocument);
        },
        /**
         * Migrates legacy math string representations to node-based format.
         */
        onCreate: ({ editor: currentEditor }) => {
            migrateMathStrings(currentEditor);
        },
        // avoid SSR hydration mismatches by explicitly opting out of
        // immediate render on the server
        immediatelyRender: false,
        editorProps: {
            attributes: {
                // Use focus:outline-none to remove the default browser outline
                // and optionally focus:ring-0 to remove the ring added by
                // the Tailwind CSS forms plugin (if used)
                class: "focus:outline-none focus:ring-0 mx-4 h-full overflow-y-scroll",
            },
        },
    });

    /**
     * Synchronizes externally provided `value` into TipTap when it diverges
     * from current editor HTML.
     */
    useEffect(() => {
        if (!editor) return;
        const current = editor.getHTML();
        if (value !== current) {
            // Use a minimal, explicit cast to satisfy the Tiptap typing
            // while preserving the previous behaviour (no-emitted update).
            // TODO: refine to the precise options type when migrating tiptap types.
            editor.commands.setContent(value || "", false as any);
        }
    }, [value, editor]);

    if (!isClient) return <div>Loading editor...</div>;

    if (inTestEnv) {
        // Minimal mock for tests: render content as plain HTML so components
        // that read initial content (like EditView) behave deterministically.
        return (
            <div data-testid="tiptap-mock" className="prose max-w-none">
                <div dangerouslySetInnerHTML={{ __html: value || "" }} />
            </div>
        );
    }

    if (!editor) return <div>Loading editor...</div>;

    return (
        <EditorContext.Provider value={{ editor }}>
            <div className="prose border max-w-4xl">
                <MenuBar editor={editor} />
                <EditorContent
                    editor={editor}
                    id={id}
                    className="tiptap h-[calc(100vh-20rem)]"
                />
            </div>
        </EditorContext.Provider>
    );
}
