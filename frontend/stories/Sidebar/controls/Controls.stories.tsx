import React from "react";
import { Meta, StoryObj } from "@storybook/react";
import NotesInput from "../../../components/Sidebar/controls/NotesInput";
import StatusSelector from "../../../components/Sidebar/controls/StatusSelector";
import MultiSelectList from "../../../components/Sidebar/controls/MultiSelectList";
import POVAutocomplete from "../../../components/Sidebar/controls/POVAutocomplete";
import DateTimeInput from "../../../components/Sidebar/controls/DateTimeInput";
import DurationInput from "../../../components/Sidebar/controls/DurationInput";

const meta: Meta = {
    title: "Sidebar/Controls",
};

export default meta;

export const Default: StoryObj = {
    render: () => (
        <div className="p-4 w-96 bg-gw-chrome">
            <NotesInput />
            <div className="mt-4">
                <StatusSelector />
            </div>
            <div className="mt-4">
                <MultiSelectList
                    label="Characters"
                    items={["Alice", "Bob", "Eve"]}
                />
            </div>
            <div className="mt-4">
                <POVAutocomplete options={["Alice", "Bob"]} />
            </div>
            <div className="mt-4">
                <DateTimeInput />
            </div>
            <div className="mt-4">
                <DurationInput />
            </div>
        </div>
    ),
};

export const StoryDateInput: StoryObj = {
    render: () => {
        const [value, setValue] = React.useState("2024-03-15");
        return (
            <div className="p-4 w-96 bg-gw-chrome">
                <DateTimeInput value={value} onChange={setValue} />
                <p className="mt-3 text-sm text-gw-secondary">Value: {value || "(empty)"}</p>
            </div>
        );
    },
};

export const StoryDurationInput: StoryObj = {
    render: () => {
        const [value, setValue] = React.useState<number | null>(null);
        return (
            <div className="p-4 w-96 bg-gw-chrome">
                <DurationInput value={value} onChange={setValue} />
                <p className="mt-3 text-sm text-gw-secondary">
                    Value: {value !== null ? `${value} min` : "(none)"}
                </p>
            </div>
        );
    },
};
