import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

interface ThemeParityShowcaseProps {
    title: string;
    description: string;
    excerpt: string;
    metadataLabel: string;
}

function ThemeParityShowcase({
    title,
    description,
    excerpt,
    metadataLabel,
}: ThemeParityShowcaseProps): JSX.Element {
    return (
        <section className="w-full max-w-4xl border-[0.5px] border-gw-border rounded-lg bg-gw-chrome overflow-hidden">
            <header className="h-11 px-4 border-b-[0.5px] border-gw-border flex items-center justify-between bg-gw-chrome2">
                <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-gw-secondary">
                    Theme Parity Surface
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-gw-secondary">
                    {metadataLabel}
                </div>
            </header>

            <div className="grid gap-0 md:grid-cols-[220px_1fr]">
                <aside className="border-b-[0.5px] md:border-b-0 md:border-r-[0.5px] border-gw-border bg-gw-chrome p-4">
                    <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-gw-secondary">
                        Resource Tree
                    </div>
                    <ul className="mt-3 space-y-1">
                        <li className="h-8 px-2 border-l-2 border-[#D44040] bg-gw-chrome2 text-gw-primary flex items-center text-sm">
                            Chapter 01
                        </li>
                        <li className="h-8 px-2 text-gw-secondary flex items-center text-sm">
                            Chapter 02
                        </li>
                        <li className="h-8 px-2 text-gw-secondary flex items-center text-sm">
                            Notes
                        </li>
                    </ul>
                </aside>

                <main className="bg-gw-editor p-6 md:p-8">
                    <h2 className="font-plex-sans text-xl leading-snug text-gw-primary">
                        {title}
                    </h2>
                    <p className="mt-2 text-sm leading-normal text-gw-secondary max-w-prose">
                        {description}
                    </p>
                    <article className="mt-5 border-[0.5px] border-gw-border rounded-md bg-gw-editor p-5">
                        <p className="font-plex-serif text-[15px] leading-[1.8] text-gw-ink">
                            {excerpt}
                        </p>
                    </article>
                </main>
            </div>
        </section>
    );
}

const meta: Meta<typeof ThemeParityShowcase> = {
    title: "Foundations/ThemeParity",
    component: ThemeParityShowcase,
};

export default meta;

type Story = StoryObj<typeof ThemeParityShowcase>;

export const Default: Story = {
    args: {
        title: "A writing surface should feel warm and stable",
        description:
            "Use the toolbar color mode toggle to confirm panel chrome, border contrast, and editor-paper temperature all shift with the same token cascade as the app shell.",
        excerpt:
            "The room is quiet except for the hinge-click of the desk lamp. I read the sentence again, moving a comma one word to the left, and suddenly the paragraph breathes.",
        metadataLabel: "Sample Story",
    },
};

function DensityShowcase(): JSX.Element {
    return (
        <div className="w-full max-w-4xl space-y-8">
            <section className="border-[0.5px] border-gw-border rounded-lg bg-gw-chrome overflow-hidden">
                <header className="h-11 px-4 border-b-[0.5px] border-gw-border flex items-center bg-gw-chrome2">
                    <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-gw-secondary">
                        Density: Comfortable
                    </div>
                </header>
                <aside className="p-4 bg-gw-chrome">
                    <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-gw-secondary mb-3">
                        Resource Tree
                    </div>
                    <ul className="space-y-1">
                        <li className="h-8 px-2 border-l-2 border-[#D44040] bg-gw-chrome2 text-gw-primary flex items-center text-sm">
                            Act I
                        </li>
                        <li className="h-8 px-2 text-gw-secondary flex items-center text-sm">
                            Act II
                        </li>
                        <li className="h-8 px-2 text-gw-secondary flex items-center text-sm">
                            Act III
                        </li>
                        <li className="h-8 px-2 text-gw-secondary flex items-center text-sm">
                            Epilogue
                        </li>
                    </ul>
                </aside>
            </section>

            <section className="border-[0.5px] border-gw-border rounded-lg bg-gw-chrome overflow-hidden gw-density-compact">
                <header className="h-9 px-4 border-b-[0.5px] border-gw-border flex items-center bg-gw-chrome2 text-xs">
                    <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-gw-secondary">
                        Density: Compact
                    </div>
                </header>
                <aside className="p-3 bg-gw-chrome">
                    <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-gw-secondary mb-2">
                        Resource Tree
                    </div>
                    <ul className="space-y-0.5">
                        <li className="h-6 px-2 border-l-2 border-[#D44040] bg-gw-chrome2 text-gw-primary flex items-center text-xs">
                            Act I
                        </li>
                        <li className="h-6 px-2 text-gw-secondary flex items-center text-xs">
                            Act II
                        </li>
                        <li className="h-6 px-2 text-gw-secondary flex items-center text-xs">
                            Act III
                        </li>
                        <li className="h-6 px-2 text-gw-secondary flex items-center text-xs">
                            Epilogue
                        </li>
                    </ul>
                </aside>
            </section>
        </div>
    );
}

export const Density: Story = {
    render: () => <DensityShowcase />,
    parameters: {
        docs: {
            description: {
                story: "UI density is applied via the gw-density-compact class. Compare spacing and sizing between comfortable (default) and compact modes. Toggle the toolbar color mode to verify both densities maintain token consistency across light and dark modes.",
            },
        },
    },
};
