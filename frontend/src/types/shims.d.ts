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
