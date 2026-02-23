import React, { useEffect } from "react";
import { useEditor, EditorContent, EditorContext } from "@tiptap/react";

export interface TipTapEditorProps {
    value?: string;
    onChange?: (content: string) => void;
    id?: string;
    readonly?: boolean;
}

export default function TipTapEditor({
    value = "",
    onChange,
    id,
    readonly = false,
}: TipTapEditorProps) {
    const isClient = typeof window !== "undefined";

    const editor = useEditor({
        extensions: [],
        content: value || "",
        editable: !readonly,
        onUpdate: ({ editor }) => {
            if (onChange) onChange(editor.getHTML());
        },
        // avoid SSR hydration mismatches by explicitly opting out of
        // immediate render on the server
        immediatelyRender: false,
    });

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

    if (!editor) return <div>Loading editor...</div>;

    return (
        <EditorContext.Provider value={{ editor }}>
            <div className="prose max-w-none">
                <div className="flex"></div>
                <EditorContent editor={editor} id={id} />
            </div>
        </EditorContext.Provider>
    );
}
