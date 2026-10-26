import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import SpellCheckEditorCue from "../../components/WorkArea/SpellCheckEditorCue";
import spellingReducer from "../../src/store/spellingSlice";
import availabilityReducer, {
  continueWithoutUserList,
  engineFailed,
  setUserListApplies,
} from "../../src/store/spellingAvailabilitySlice";
import userWordListReducer, {
  initialUserWordListState,
  loadUserList,
} from "../../src/store/userWordListSlice";
import {
  SPELLCHECK_ENABLED_STORAGE_KEY,
  resetSpellcheckSessionValue,
} from "../../src/lib/spellcheck-preference";
import { OPEN_APP_SETTINGS_EVENT } from "../../src/lib/app-settings-open";

/**
 * The editor-footer cue about the spell checker (Feature 96, spec FR-24).
 * Each story builds a store with the lists loaded, then adds the one reason
 * it shows. The cue sits in a footer-like bar so spacing and wrapping match.
 */
type Store = ReturnType<typeof createStore>;

function createStore(loaded = true) {
  const initial = spellingReducer(undefined, { type: "@@init" });
  return configureStore({
    reducer: {
      spelling: spellingReducer,
      spellingAvailability: availabilityReducer,
      userWordList: userWordListReducer,
    },
    preloadedState: {
      spelling: loaded
        ? {
            ...initial,
            status: "loaded" as const,
            aliasTableStatus: "loaded" as const,
          }
        : initial,
      spellingAvailability: availabilityReducer(undefined, { type: "@@init" }),
      userWordList: initialUserWordListState,
    },
  });
}

function withStore(configure?: (store: Store) => void, loaded = true) {
  return function Decorator(Story: React.ComponentType) {
    const [store] = React.useState(() => {
      const s = createStore(loaded);
      configure?.(s);
      return s;
    });
    return (
      <Provider store={store}>
        <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-gw-border bg-gw-chrome px-4 py-2 text-sm w-[360px]">
          <span className="text-gw-secondary text-gw-small">Words: 120</span>
          <Story />
          <span className="text-gw-small">Saved</span>
        </footer>
      </Provider>
    );
  };
}

function storeSwitch(value: "true" | "false" | null): () => void {
  resetSpellcheckSessionValue();
  if (value === null)
    window.localStorage.removeItem(SPELLCHECK_ENABLED_STORAGE_KEY);
  else window.localStorage.setItem(SPELLCHECK_ENABLED_STORAGE_KEY, value);
  return () => {
    window.localStorage.removeItem(SPELLCHECK_ENABLED_STORAGE_KEY);
    resetSpellcheckSessionValue();
  };
}

const meta: Meta<typeof SpellCheckEditorCue> = {
  title: "WorkArea/SpellCheckEditorCue",
  component: SpellCheckEditorCue,
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof SpellCheckEditorCue>;

/** Paused for a failure: short text, the reason in the status, a settings button. */
export const Paused: Story = {
  decorators: [withStore((s) => s.dispatch(engineFailed("worker crashed")))],
  beforeEach: () => storeSwitch(null),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const status = await canvas.findByRole("status");
    await expect(status).toHaveTextContent("Spell check paused");
    await expect(status).toHaveTextContent(
      "The spell checker stopped working (worker crashed).",
    );
    let requestCount = 0;
    const onRequest = (): void => {
      requestCount += 1;
    };
    window.addEventListener(OPEN_APP_SETTINGS_EVENT, onRequest);
    await userEvent.click(
      canvas.getByRole("button", { name: "Spell check settings" }),
    );
    window.removeEventListener(OPEN_APP_SETTINGS_EVENT, onRequest);
    await expect(requestCount).toBe(1);
  },
};

/** After "Continue without my dictionary": quieter text, no button. */
export const NotApplied: Story = {
  decorators: [
    withStore((s) => {
      s.dispatch(
        loadUserList.rejected(null, "r", undefined, {
          reason: "read-failed",
          message: "x",
        }),
      );
      s.dispatch(setUserListApplies(true));
      s.dispatch(continueWithoutUserList());
    }),
  ],
  beforeEach: () => storeSwitch(null),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "Your words aren't applied",
    );
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};

/** The checker is active: the status region is empty. */
export const Active: Story = {
  decorators: [withStore()],
  beforeEach: () => storeSwitch(null),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("status")).toBeEmptyDOMElement();
  },
};

/** Still loading is not a failure: nothing is shown. */
export const Loading: Story = {
  decorators: [withStore(undefined, false)],
  beforeEach: () => storeSwitch(null),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("status")).toBeEmptyDOMElement();
  },
};

/** The spelling switch is off: nothing is shown even though the engine failed. */
export const SwitchOff: Story = {
  decorators: [withStore((s) => s.dispatch(engineFailed("worker crashed")))],
  beforeEach: () => storeSwitch("false"),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("status")).toBeEmptyDOMElement();
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};
