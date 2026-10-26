import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import SpellcheckSetting from "../../components/AppSettings/SpellcheckSetting";
import spellingReducer, {
  type SpellingState,
} from "../../src/store/spellingSlice";
import availabilityReducer, {
  browserUnsupported,
  engineFailed,
} from "../../src/store/spellingAvailabilitySlice";
import {
  SPELLCHECK_ENABLED_STORAGE_KEY,
  resetSpellcheckSessionValue,
} from "../../src/lib/spellcheck-preference";

/**
 * `SpellcheckSetting` reads the `spelling` and `spellingAvailability`
 * slices and the app-wide switch in `localStorage`. Each story starts the
 * lists and alias table as loaded (so the only status-line reasons are the
 * ones the story adds) and sets the stored switch value in `beforeEach`,
 * restoring it afterwards.
 */
function makeStore(
  configure?: (store: ReturnType<typeof createStore>) => void,
) {
  const store = createStore();
  configure?.(store);
  return store;
}

function createStore() {
  const initial = spellingReducer(undefined, { type: "@@init" });
  const loaded: SpellingState = {
    ...initial,
    status: "loaded",
    aliasTableStatus: "loaded",
  };
  return configureStore({
    reducer: {
      spelling: spellingReducer,
      spellingAvailability: availabilityReducer,
    },
    preloadedState: {
      spelling: loaded,
      spellingAvailability: availabilityReducer(undefined, { type: "@@init" }),
    },
  });
}

function withStore(configure?: Parameters<typeof makeStore>[0]) {
  return function Decorator(Story: React.ComponentType) {
    const [store] = React.useState(() => makeStore(configure));
    return (
      <Provider store={store}>
        <Story />
      </Provider>
    );
  };
}

/** Sets the stored switch value (or clears it) for the story's lifetime. */
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

const SWITCH_NAME = "Check spelling while I write";

const meta: Meta<typeof SpellcheckSetting> = {
  title: "AppSettings/SpellcheckSetting",
  component: SpellcheckSetting,
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof SpellcheckSetting>;

/** The default: spell check is on and the checker is available. */
export const On: Story = {
  decorators: [withStore()],
  beforeEach: () => storeSwitch(null),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const toggle = await canvas.findByRole("switch", { name: SWITCH_NAME });
    await expect(toggle).toBeChecked();
    await expect(canvas.queryByRole("status")).toBeNull();
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
  },
};

/** The writer turned spell check off: the switch is unchecked. */
export const Off: Story = {
  decorators: [withStore()],
  beforeEach: () => storeSwitch("false"),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const toggle = await canvas.findByRole("switch", { name: SWITCH_NAME });
    await waitFor(() => expect(toggle).not.toBeChecked());
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
  },
};

/** The engine failed: the status line names the reason. */
export const UnavailableEngineFailed: Story = {
  decorators: [
    withStore((store) => {
      store.dispatch(engineFailed("worker crashed"));
    }),
  ],
  beforeEach: () => storeSwitch(null),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("switch", { name: SWITCH_NAME }),
    ).toBeChecked();
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "The spell checker stopped working (worker crashed).",
    );
  },
};

/** The browser is older than the minimum: the status line says so. */
export const UnavailableUnsupportedBrowser: Story = {
  decorators: [
    withStore((store) => {
      store.dispatch(browserUnsupported({ detected: 60, minimum: 67 }));
    }),
  ],
  beforeEach: () => storeSwitch(null),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "Spell checking needs Chrome 67 or newer; this is Chrome 60.",
    );
  },
};
