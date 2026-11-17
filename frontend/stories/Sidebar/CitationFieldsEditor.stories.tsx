import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import CitationFieldsEditor, {
  CITATION_FIELDS_SAVE_DEBOUNCE_MS,
} from "../../components/Sidebar/CitationFieldsEditor";

type FetchMode =
  | "empty"
  | "stored"
  | "stored-organisation"
  | "stored-invalid-date"
  | "read-fails"
  | "save-fails";

interface StoryArgs {
  fetchMode: FetchMode;
  stillNeeds?: string;
}

const STORED = {
  referenceType: "article",
  title: "On the tides of the northern coast",
  journal: "Coastal Review",
  date: "2019-04",
  authors: [{ family: "Hale", given: "Ada" }],
};

const STORED_INVALID_DATE = {
  referenceType: "web-page",
  title: "Tide tables",
  website: "Tide Board",
  date: "2005-01-55",
};

const STORED_ORGANISATION = {
  referenceType: "web-page",
  title: "Tide tables",
  website: "Tide Board",
  authors: [{ literal: "Tide Board" }],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Replaces `fetch` for the citation fields route only; restored on unmount. */
function useCitationFieldsFetch(mode: FetchMode): void {
  const original = React.useRef<typeof fetch | null>(null);
  if (original.current === null) {
    original.current = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : String(input);
      if (!url.includes("/api/citations/fields")) {
        return original.current!(input, init);
      }
      if ((init?.method ?? "GET") === "GET") {
        if (mode === "read-fails") {
          return json({ error: "The citation fields could not be read." }, 500);
        }
        const stored =
          mode === "stored"
            ? STORED
            : mode === "stored-organisation"
              ? STORED_ORGANISATION
              : mode === "stored-invalid-date"
                ? STORED_INVALID_DATE
                : null;
        return json({ kind: "fields", fields: stored });
      }
      if (mode === "save-fails") {
        return json({ error: "The citation fields could not be saved." }, 500);
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        fields: unknown;
      };
      return json({ fields: body.fields });
    };
  }
  React.useEffect(
    () => () => {
      if (original.current) globalThis.fetch = original.current;
    },
    [],
  );
}

function Harness({ fetchMode, stillNeeds }: StoryArgs): JSX.Element {
  useCitationFieldsFetch(fetchMode);
  const [sourceId, setSourceId] = React.useState("story-source");
  const [notSaved, setNotSaved] = React.useState<string | null>(null);
  return (
    <div style={{ width: 320 }}>
      {notSaved !== null && <p role="alert">{notSaved}</p>}
      <CitationFieldsEditor
        key={sourceId}
        projectId="story-project"
        resourceId={sourceId}
        stillNeeds={stillNeeds}
        onUnsavedOnLeave={setNotSaved}
      />
      <button type="button" onClick={() => setSourceId((id) => `${id}-next`)}>
        Switch Source
      </button>
    </div>
  );
}

/** Longer than the editor's debounce, so the play function waits for the save. */
const SAVE_WAIT = { timeout: CITATION_FIELDS_SAVE_DEBOUNCE_MS + 2000 };

const meta: Meta<StoryArgs> = {
  title: "Sidebar/CitationFieldsEditor",
  parameters: { a11y: { test: "error" } },
  args: { fetchMode: "empty" },
  render: (args: StoryArgs) => <Harness key={args.fetchMode} {...args} />,
};
export default meta;

type Story = StoryObj<StoryArgs>;

/** A Source with no stored fields: a book form, nothing written on open. */
export const Empty: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByLabelText("Reference type")).toBeInTheDocument();
  },
};

/** Stored fields of an article, with a person entered as family and given. */
export const StoredArticle: Story = {
  args: { fetchMode: "stored" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByLabelText("Title")).toHaveValue(STORED.title);
  },
};

/** An organisation author is entered as one name. */
export const OrganisationAuthor: Story = {
  args: { fetchMode: "stored-organisation" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByLabelText("Authors 1 organisation name"),
    ).toHaveValue("Tide Board");
  },
};

/** The "still needs" line is text supplied by the caller. */
export const WithStillNeeds: Story = {
  args: { stillNeeds: "Still needs: publisher, place, date" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText("Still needs: publisher, place, date"),
    ).toBeInTheDocument();
  },
};

/** A change is saved after a pause, and a confirmation shows in a status region. */
export const Saved: Story = {
  args: { fetchMode: "stored" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(await canvas.findByLabelText("Title"), " II");
    await waitFor(() => {
      const statuses = canvas.getAllByRole("status");
      expect(
        statuses.some((s) => s.textContent === "Citation fields saved."),
      ).toBe(true);
    }, SAVE_WAIT);
  },
};

/** A failed save is shown in an alert and the typed values stay. */
export const SaveFails: Story = {
  args: { fetchMode: "save-fails" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(await canvas.findByLabelText("Title"), "Tides");
    expect(await canvas.findByRole("alert", {}, SAVE_WAIT)).toHaveTextContent(
      "could not be saved",
    );
    expect(canvas.getByLabelText("Title")).toHaveValue("Tides");
  },
};

/** A stored date that is not a real date is marked in text and blocks the save. */
export const InvalidField: Story = {
  args: { fetchMode: "stored-invalid-date" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const date = await canvas.findByLabelText("Date");
    expect(date).toHaveAttribute("aria-invalid", "true");
    expect(canvas.getByText(/not a real date/i)).toBeInTheDocument();
    await userEvent.type(canvas.getByLabelText("Title"), " II");
    expect(
      await canvas.findByText(/Not saved yet/i, {}, SAVE_WAIT),
    ).toBeInTheDocument();
  },
};

/** Leaving with a field still invalid shows a message that the changes were not saved. */
export const NotSavedOnLeaving: Story = {
  args: { fetchMode: "empty" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(await canvas.findByLabelText("Date"), "2005-01-55");
    await userEvent.click(
      canvas.getByRole("button", { name: "Switch Source" }),
    );
    expect(await canvas.findByRole("alert")).toHaveTextContent(/not saved/i);
  },
};

/** A failed read shows an alert with Retry, not empty fields. */
export const ReadFails: Story = {
  args: { fetchMode: "read-fails" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByRole("alert")).toHaveTextContent(
      "could not be loaded",
    );
    expect(canvas.queryByLabelText("Reference type")).toBeNull();
  },
};
