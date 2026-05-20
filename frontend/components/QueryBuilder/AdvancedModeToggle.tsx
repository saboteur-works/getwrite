"use client";

import React, { useCallback, useState } from "react";
import { QueryASTSchema, type QueryAST } from "../../src/lib/models/query-ast";
import { isTwoLevelCompatible, astToGroups } from "./ast-chip-bridge";
import type { FilterChipField } from "./FilterChip";
import type { GlobalCombinator, QueryGroup } from "./QueryBuilder";
import "./advanced-mode-toggle.css";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AdvancedModeToggleProps {
    /** JSON string of the current QueryAST, pre-populated in the textarea. */
    initialJson: string;
    /** Fields registry used when converting a compatible AST back to chips. */
    availableFields?: FilterChipField[];
    /**
     * Called when the user successfully parses a two-level AST and requests
     * to return to chip view.
     */
    onRestore: (groups: QueryGroup[], globalCombinator: GlobalCombinator) => void;
    /** Called when the user dismisses the editor without restoring chip view. */
    onCancel?: () => void;
}

// ─── AdvancedModeToggle ───────────────────────────────────────────────────────

export default function AdvancedModeToggle({
    initialJson,
    availableFields = [],
    onRestore,
    onCancel,
}: AdvancedModeToggleProps): JSX.Element {
    const [json, setJson] = useState(initialJson);
    const [error, setError] = useState<string | null>(null);

    const handleRestore = useCallback(() => {
        let parsed: unknown;
        try {
            parsed = JSON.parse(json);
        } catch {
            setError("Invalid JSON — fix syntax errors before restoring.");
            return;
        }

        const result = QueryASTSchema.safeParse(parsed);
        if (!result.success) {
            setError("JSON is not a valid query AST.");
            return;
        }

        // QueryASTSchema uses z.lazy(); the inferred type is `any` at the Zod
        // boundary, but a successful parse guarantees the QueryAST shape.
        const ast = result.data as QueryAST;

        if (!isTwoLevelCompatible(ast)) {
            setError(
                "Query uses nesting beyond two levels — edit it to use only simple conditions before restoring chip view.",
            );
            return;
        }

        const restored = astToGroups(ast, availableFields);
        if (!restored) {
            setError("Could not convert AST back to chip form.");
            return;
        }

        setError(null);
        onRestore(restored.groups, restored.globalCombinator);
    }, [json, availableFields, onRestore]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setJson(e.target.value);
        if (error) setError(null);
    }, [error]);

    const textareaClass = [
        "advanced-mode-toggle__textarea",
        error ? "advanced-mode-toggle__textarea--error" : "",
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <div className="advanced-mode-toggle">
            <div className="advanced-mode-toggle__header">
                <span className="advanced-mode-toggle__label">Query AST — JSON</span>
            </div>

            <textarea
                className={textareaClass}
                value={json}
                onChange={handleChange}
                aria-label="Query AST JSON editor"
                spellCheck={false}
            />

            {error && (
                <span className="advanced-mode-toggle__error" role="alert">
                    {error}
                </span>
            )}

            <div className="advanced-mode-toggle__footer">
                <button
                    type="button"
                    className="advanced-mode-toggle__restore"
                    onClick={handleRestore}
                >
                    Back to chip view
                </button>
                {onCancel && (
                    <button
                        type="button"
                        className="advanced-mode-toggle__cancel"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                )}
                <span className="advanced-mode-toggle__hint">
                    2-level ASTs restore to chips
                </span>
            </div>
        </div>
    );
}
