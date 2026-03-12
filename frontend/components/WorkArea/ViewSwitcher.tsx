/**
 * @module WorkArea/ViewSwitcher
 *
 * Renders a compact tab-style control used to switch between Work Area views.
 *
 * This component is intentionally controlled and stateless:
 * - Parent components own the selected view state.
 * - Selection changes are emitted through `onChange`.
 * - Disabled views can be provided as either a static array or a resolver
 *   function evaluated on each render.
 */
import React from "react";
import { ViewName } from "../../src/lib/models/types";

/**
 * Props accepted by {@link ViewSwitcher}.
 */
export interface ViewSwitcherProps {
    /** Currently selected Work Area view. */
    view: ViewName;
    /**
     * Invoked when the user selects a new view via click or keyboard.
     *
     * @param view - Newly selected view key.
     */
    onChange: (view: ViewName) => void;
    /** Optional class name appended to the outer tablist container. */
    className?: string;
    /**
     * Views that should render as disabled.
     *
     * Accepts either:
     * - A static array of disabled view keys.
     * - A function that returns disabled view keys for dynamic state.
     */
    disabledViews?: ViewName[] | (() => ViewName[]);
}

/** Display option metadata for each selectable Work Area view tab. */
interface ViewOption {
    /** Internal view key persisted in component state and callbacks. */
    key: ViewName;
    /** Human-readable label shown on the tab button. */
    label: string;
}

/** Ordered view options rendered by {@link ViewSwitcher}. */
const VIEW_OPTIONS: ViewOption[] = [
    { key: "edit", label: "Edit" },
    { key: "organizer", label: "Organizer" },
    { key: "data", label: "Data" },
    { key: "diff", label: "Diff" },
    { key: "timeline", label: "Timeline" },
];

/**
 * Renders a tablist for switching between Work Area views.
 *
 * Accessibility and keyboard behavior:
 * - Uses `role="tablist"` and `role="tab"` semantics.
 * - ArrowRight/ArrowLeft move focus and switch selection.
 * - Home/End jump to first/last tab and switch selection.
 * - Enter/Space activates the currently focused tab.
 *
 * Disabled behavior:
 * - Disabled tabs receive `disabled` and `aria-disabled`.
 * - Click and keyboard activation are ignored for disabled tabs.
 *
 * @param props - {@link ViewSwitcherProps} values.
 * @returns A controlled tab switcher element.
 *
 * @example
 * const [view, setView] = React.useState<ViewName>("edit");
 *
 * <ViewSwitcher
 *   view={view}
 *   onChange={setView}
 *   disabledViews={["diff"]}
 * />
 *
 * @example
 * <ViewSwitcher
 *   view={view}
 *   onChange={setView}
 *   disabledViews={() => (isReadonly ? ["edit", "data"] : [])}
 * />
 */
export default function ViewSwitcher({
    view,
    onChange,
    className = "",
    disabledViews = [],
}: ViewSwitcherProps): JSX.Element {
    const resolvedDisabledViews =
        typeof disabledViews === "function" ? disabledViews() : disabledViews;

    return (
        <div
            className={`workarea-view-tabs ${className}`}
            role="tablist"
            aria-label="Work area views"
        >
            {VIEW_OPTIONS.map((opt) => {
                const active = opt.key === view;
                const disabled = resolvedDisabledViews.includes(opt.key);
                return (
                    <button
                        key={opt.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        aria-pressed={active}
                        aria-disabled={disabled}
                        disabled={disabled}
                        data-view={opt.key}
                        onClick={() => !disabled && onChange(opt.key)}
                        onKeyDown={(e) => {
                            const container =
                                (e.currentTarget
                                    .parentElement as HTMLElement) || null;
                            const tabs = container
                                ? (Array.from(
                                      container.querySelectorAll(
                                          '[role="tab"]',
                                      ),
                                  ) as HTMLElement[])
                                : [];
                            const idx = tabs.indexOf(
                                e.currentTarget as HTMLElement,
                            );
                            if (e.key === "ArrowRight") {
                                const next = tabs[(idx + 1) % tabs.length];
                                next?.focus();
                                onChange(
                                    (next?.dataset.view as ViewName) ?? view,
                                );
                                e.preventDefault();
                            } else if (e.key === "ArrowLeft") {
                                const prev =
                                    tabs[(idx - 1 + tabs.length) % tabs.length];
                                prev?.focus();
                                onChange(
                                    (prev?.dataset.view as ViewName) ?? view,
                                );
                                e.preventDefault();
                            } else if (e.key === "Home") {
                                tabs[0]?.focus();
                                onChange(
                                    (tabs[0]?.dataset.view as ViewName) ?? view,
                                );
                                e.preventDefault();
                            } else if (e.key === "End") {
                                tabs[tabs.length - 1]?.focus();
                                onChange(
                                    (tabs[tabs.length - 1]?.dataset
                                        .view as ViewName) ?? view,
                                );
                                e.preventDefault();
                            } else if (e.key === "Enter" || e.key === " ") {
                                if (!disabled) onChange(opt.key);
                                e.preventDefault();
                            }
                        }}
                        className="workarea-tab-button"
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
