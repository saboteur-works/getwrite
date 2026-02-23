// Minimal shims for focused storybook type checking
// These reduce noisy errors while migrating to canonical models.

// Storybook module shim (lightweight)
declare module "@storybook/react" {
    export type Meta<T = any> = any;
    export type StoryObj<T = any> = any;
    export const Meta: any;
}

// Minimal test globals used in story play functions
declare const expect: any;

declare module "@testing-library/dom" {
    export const screen: any;
    export const within: any;
}

// Provide minimal JSX namespace so focused tsc can typecheck components
declare namespace JSX {
    // Use React's ReactElement so function components are compatible with React types
    type Element = import("react").ReactElement<any, any>;
    interface IntrinsicElements {
        [elemName: string]: any;
    }
    interface ElementAttributesProperty {
        props: any;
    }
    interface ElementChildrenAttribute {
        children: any;
    }
}

// Storybook fast shim for the nextjs-vite preset used in stories
declare module "@storybook/nextjs-vite" {
    export * from "@storybook/react";
}

// Testing-library: add waitFor signature used in some stories
declare module "@testing-library/react" {
    export * from "@testing-library/dom";
    export function waitFor(fn: any, opts?: any): Promise<any>;
}
