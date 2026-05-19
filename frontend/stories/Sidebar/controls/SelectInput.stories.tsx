import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import SelectInput from "../../../components/Sidebar/controls/SelectInput";

const meta: Meta<typeof SelectInput> = {
    title: "Sidebar/Controls/SelectInput",
    component: SelectInput,
};

export default meta;

type Story = StoryObj<typeof SelectInput>;

const GENRE_OPTIONS = [
    "Fantasy",
    "Science Fiction",
    "Romance",
    "Mystery",
    "Thriller",
];

export const SingleSelect: Story = {
    args: {
        label: "Genre",
        options: GENRE_OPTIONS,
        value: "Fantasy",
        onChange: (value: string | string[]) => console.log("genre", value),
        multiple: false,
    },
};

export const SingleSelectEmpty: Story = {
    args: {
        label: "Genre",
        options: GENRE_OPTIONS,
        value: undefined,
        onChange: (value: string | string[]) => console.log("genre", value),
        multiple: false,
    },
};

export const MultiSelect: Story = {
    args: {
        label: "Genres",
        options: GENRE_OPTIONS,
        value: ["Fantasy", "Mystery"],
        onChange: (value: string | string[]) => console.log("genres", value),
        multiple: true,
    },
};

export const MultiSelectEmpty: Story = {
    args: {
        label: "Genres",
        options: GENRE_OPTIONS,
        value: [],
        onChange: (value: string | string[]) => console.log("genres", value),
        multiple: true,
    },
};
