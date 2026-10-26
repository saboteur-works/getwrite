import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import SpellingSettingsTab from "../../components/Layout/SpellingSettingsTab";
import spellingReducer, {
  fetchSpellingLists,
} from "../../src/store/spellingSlice";

/**
 * `SpellingSettingsTab` reads the `spelling` slice, which loads and mutates
 * through `lib/api/project-spelling.ts`; on the web path that calls `fetch`
 * directly. Each story stubs `globalThis.fetch` (as
 * `NoiseWordsSettingsTab.stories.tsx` does) and the decorator mounts the tab
 * under a store holding only the spelling reducer, loaded from the stub.
 */
interface Lists {
  spellingProjectWords: string[];
  spellingIgnoredWords: string[];
}

function mockSpellingFetch(options: {
  lists: Lists;
  failLoad?: boolean;
  failMutations?: boolean;
}) {
  const originalFetch = globalThis.fetch;
  let lists: Lists = {
    spellingProjectWords: [...options.lists.spellingProjectWords],
    spellingIgnoredWords: [...options.lists.spellingIgnoredWords],
  };
  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    if (!url.includes("/api/project/spelling")) {
      return { ok: true, json: async () => ({}) } as Response;
    }
    if (init?.method === "POST") {
      if (options.failMutations) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: "disk is read-only" }),
        } as Response;
      }
      const body = JSON.parse((init.body as string) ?? "{}") as {
        action: string;
        word: string;
      };
      if (body.action === "remove-word") {
        lists = {
          ...lists,
          spellingProjectWords: lists.spellingProjectWords.filter(
            (w) => w !== body.word,
          ),
        };
      } else if (body.action === "unignore-word") {
        lists = {
          ...lists,
          spellingIgnoredWords: lists.spellingIgnoredWords.filter(
            (w) => w !== body.word,
          ),
        };
      }
    } else if (options.failLoad) {
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: "lists unavailable" }),
      } as Response;
    }
    return { ok: true, json: async () => lists } as Response;
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

/** Fresh spelling-only store per story, loaded from the stubbed fetch. */
const withSpellingStore = (Story: React.ComponentType) => {
  const [store] = React.useState(() => {
    const created = configureStore({ reducer: { spelling: spellingReducer } });
    void created.dispatch(fetchSpellingLists("project-1"));
    return created;
  });
  return (
    <Provider store={store}>
      <Story />
    </Provider>
  );
};

const meta: Meta<typeof SpellingSettingsTab> = {
  title: "Layout/SpellingSettingsTab",
  component: SpellingSettingsTab,
  decorators: [withSpellingStore],
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof SpellingSettingsTab>;

/** Neither list has any words: each shows its empty-state sentence. */
export const Empty: Story = {
  beforeEach: () =>
    mockSpellingFetch({
      lists: { spellingProjectWords: [], spellingIgnoredWords: [] },
    }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("No words in the project dictionary."),
    ).toBeInTheDocument();
    await expect(canvas.getByText("No ignored words.")).toBeInTheDocument();
    await expect(
      canvas.getByRole("heading", { name: "Project dictionary (0)" }),
    ).toBeInTheDocument();
  },
};

/** Both lists populated, sorted ignoring case, with a remove button per word. */
export const Populated: Story = {
  beforeEach: () =>
    mockSpellingFetch({
      lists: {
        spellingProjectWords: ["Zed", "aria"],
        spellingIgnoredWords: ["teh"],
      },
    }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const dictionary = within(
      await canvas.findByRole("list", { name: "Project dictionary (2)" }),
    );
    await expect(
      dictionary.getAllByRole("listitem").map((li) => li.textContent),
    ).toEqual(["aria", "Zed"]);
    await expect(
      canvas.getByRole("button", { name: "Remove teh from ignored words" }),
    ).toBeInTheDocument();
  },
};

/** Removing an ignored word updates the list from the response. */
export const RemoveWord: Story = {
  beforeEach: () =>
    mockSpellingFetch({
      lists: { spellingProjectWords: [], spellingIgnoredWords: ["teh"] },
    }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Remove teh from ignored words",
      }),
    );
    await expect(
      await canvas.findByText("No ignored words."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        canvas.getByRole("heading", { name: "Ignored words (0)" }),
      ).toHaveFocus(),
    );
  },
};

/** The lists could not be loaded: a message, never an empty-state sentence. */
export const LoadFailed: Story = {
  beforeEach: () =>
    mockSpellingFetch({
      lists: { spellingProjectWords: [], spellingIgnoredWords: [] },
      failLoad: true,
    }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/Could not load the spelling lists/),
    ).toBeInTheDocument();
    await expect(canvas.queryByText("No ignored words.")).toBeNull();
  },
};

/** A remove request fails: an inline alert, and the word stays listed. */
export const RemoveFailed: Story = {
  beforeEach: () =>
    mockSpellingFetch({
      lists: { spellingProjectWords: [], spellingIgnoredWords: ["teh"] },
      failMutations: true,
    }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Remove teh from ignored words",
      }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(/teh/);
    await expect(
      canvas.getByRole("button", { name: "Remove teh from ignored words" }),
    ).toBeInTheDocument();
  },
};
