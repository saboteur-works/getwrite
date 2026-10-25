import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import CreateProjectModal, {
  CreateProjectModalProps,
  CreateProjectPayload,
} from "../../components/Start/CreateProjectModal";

const meta: Meta<typeof CreateProjectModal> = {
  title: "Start/CreateProjectModal",
  component: CreateProjectModal,
};

export default meta;

type Story = StoryObj<typeof CreateProjectModal>;

/** Sets what the mocked `/api/project-types` returns for the next render. */
function setProjectTypesMode(mode: "ok" | "notice" | "error"): void {
  (window as any).__storybookProjectTypesMode = mode;
}

export const Open: Story = {
  args: {
    isOpen: true,
    defaultName: "My Project",
    defaultType: "novel",
    onClose: () => console.log("close"),
    onCreate: (payload: CreateProjectPayload) => console.log("create", payload),
  },
  render: (args: CreateProjectModalProps) => {
    setProjectTypesMode("ok");
    // Install a lightweight fetch mock synchronously so the modal's
    // `loadTypes` effect sees mocked responses immediately when it runs.
    if (
      typeof window !== "undefined" &&
      !(window as any).__storybookFetchMockInstalled
    ) {
      (window as any).__storybookFetchMockInstalled = true;
      const origFetch = window.fetch;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      window.fetch = async (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.endsWith("/api/project-types")) {
          const mode = (window as any).__storybookProjectTypesMode;
          if (mode === "error") {
            return new Response(null, { status: 500 });
          }
          return new Response(
            // Must satisfy `ProjectTypeListResponseSchema`: entries of
            // `{ spec, fileName, source }` (specs are `ProjectTypeSchema`,
            // `.strict()` with a non-empty `folders` array), `unusable` and
            // `savedStatus`. A body of any other shape is rejected by the
            // transport, leaving the select with no options.
            JSON.stringify({
              entries: [
                {
                  spec: {
                    id: "novel",
                    name: "Novel (default)",
                    description: "Long form",
                    folders: [{ name: "Manuscript" }],
                  },
                  fileName: "novel.json",
                  source: "built-in",
                },
                {
                  spec: {
                    id: "short",
                    name: "Short Story",
                    description: "Short form",
                    folders: [{ name: "Manuscript" }],
                  },
                  fileName: "short.json",
                  source: "built-in",
                },
                {
                  spec: {
                    id: "my-saved",
                    name: "My Saved Type",
                    folders: [{ name: "Notes" }],
                  },
                  fileName: "my-saved.json",
                  source: "saved",
                },
              ],
              unusable:
                mode === "notice"
                  ? [{ fileName: "broken.json", reason: "invalid" }]
                  : [],
              savedStatus: "ok",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.endsWith("/api/projects") && init?.method === "POST") {
          try {
            const body = init.body ? JSON.parse(String(init.body)) : {};
            // Must satisfy `ProjectApiEntrySchema` (`src/lib/api/schemas.ts`):
            // a `ProjectSchema` project whose `id` is a real UUID and whose
            // `createdAt` is an ISO date, plus `folders` and `resources`
            // arrays. Feature 48 made `projects.create` validate and throw on
            // a malformed body, so the previous `{ id: "proj_<ms>", name }`
            // meant `onCreate` never fired and the story's payload probe
            // stayed empty.
            const project = {
              id: crypto.randomUUID(),
              name: body.name,
              createdAt: new Date().toISOString(),
            };
            return new Response(
              JSON.stringify({ project, folders: [], resources: [] }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          } catch (e) {
            return new Response(null, { status: 500 });
          }
        }
        return origFetch(input, init);
      };
    }

    const Wrapper = () => {
      const [isOpen, setOpen] = React.useState(true);
      const [created, setCreated] = React.useState<CreateProjectPayload | null>(
        null,
      );
      return (
        <div>
          <CreateProjectModal
            {...args}
            isOpen={isOpen}
            onClose={() => setOpen(false)}
            onCreate={(p) => {
              setCreated(p);
              args.onCreate?.(p);
            }}
          />
          <div
            data-testid="created-payload"
            aria-hidden
            style={{ display: "none" }}
          >
            {created ? JSON.stringify(created) : ""}
          </div>
        </div>
      );
    };

    return <Wrapper />;
  },
};

/** A saved file that could not be used: the notice shows under the select. */
export const WithUnusableSavedFile: Story = {
  ...Open,
  render: (args: CreateProjectModalProps) => {
    const base = Open.render as (a: CreateProjectModalProps) => JSX.Element;
    const element = base(args);
    setProjectTypesMode("notice");
    return element;
  },
};

/** The list could not be loaded: the error and Retry show, with no stale list. */
export const LoadError: Story = {
  ...Open,
  render: (args: CreateProjectModalProps) => {
    const base = Open.render as (a: CreateProjectModalProps) => JSX.Element;
    const element = base(args);
    setProjectTypesMode("error");
    return element;
  },
};
