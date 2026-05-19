import React from "react";
import { Pencil, LayoutList, BarChart3, GitCompare, Clock } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "../common/UI/Tabs/Tabs";
import { ViewName } from "../../src/lib/models/types";

export interface ViewSwitcherProps {
    view: ViewName;
    onChange: (view: ViewName) => void;
    className?: string;
    disabledViews?: ViewName[] | (() => ViewName[]);
}

interface ViewOption {
    key: ViewName;
    label: string;
    icon: React.ComponentType<{
        size?: number;
        "aria-hidden"?: boolean | "true" | "false";
    }>;
}

const VIEW_OPTIONS: ViewOption[] = [
    { key: "edit", label: "Edit", icon: Pencil },
    { key: "organizer", label: "Organizer", icon: LayoutList },
    { key: "data", label: "Data", icon: BarChart3 },
    { key: "diff", label: "Diff", icon: GitCompare },
    { key: "timeline", label: "Timeline", icon: Clock },
];

export default function ViewSwitcher({
    view,
    onChange,
    className = "",
    disabledViews = [],
}: ViewSwitcherProps): JSX.Element {
    const resolvedDisabledViews =
        typeof disabledViews === "function" ? disabledViews() : disabledViews;

    return (
        <Tabs value={view} onValueChange={(v) => onChange(v as ViewName)}>
            <TabsList
                aria-label="Work area views"
                className={`workarea-view-tabs ${className}`}
            >
                {VIEW_OPTIONS.map((opt) => (
                    <TabsTrigger
                        key={opt.key}
                        value={opt.key}
                        disabled={resolvedDisabledViews.includes(opt.key)}
                        className="workarea-tab-button"
                    >
                        <opt.icon size={14} aria-hidden="true" />
                        {opt.label}
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    );
}
