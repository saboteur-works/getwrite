import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import CaptureBoxHost from "../../components/Capture/CaptureBoxHost";
import { LimitRefusalError } from "../../src/lib/api/limit-refusal";
import type {
  CaptureRequest,
  CaptureResult,
} from "../../src/lib/api/inbox-capture-types";

type ProjectsMode = "ok" | "failed" | "empty";

const PROJECTS = [
  {
    project: {
      id: "novel-1",
      name: "The Lighthouse Novel",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    folders: [],
    resources: [],
  },
  {
    project: {
      id: "essays-1",
      name: "Essays",
      createdAt: "2026-02-01T00:00:00.000Z",
    },
    folders: [],
    resources: [],
  },
];

/** Answers `GET /api/projects` per mode while mounted; restores fetch on unmount. */
function ProjectsFetchMock({
  mode,
  children,
}: {
  mode: ProjectsMode;
  children: React.ReactNode;
}): JSX.Element {
  const [isReady, setIsReady] = React.useState<boolean>(false);
  React.useLayoutEffect(() => {
    const original = window.fetch;
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.endsWith("/api/projects")) {
        if (mode === "failed") return new Response(null, { status: 500 });
        return new Response(JSON.stringify(mode === "empty" ? [] : PROJECTS), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return original(input, init);
    }) as typeof window.fetch;
    setIsReady(true);
    return () => {
      window.fetch = original;
    };
  }, [mode]);
  return isReady ? <>{children}</> : <></>;
}

function withProjects(mode: ProjectsMode) {
  const decorator = (Story: React.ComponentType): JSX.Element => (
    <ProjectsFetchMock mode={mode}>
      <Story />
    </ProjectsFetchMock>
  );
  decorator.displayName = `withProjects(${mode})`;
  return decorator;
}

const created = (notice?: "seeding" | "writing-log"): CaptureResult => ({
  status: "created",
  resourceId: "r1",
  inboxFolderId: "inbox-1",
  notices: notice
    ? [{ code: notice, severity: "error", message: "notice" }]
    : [],
});

function fakeCapture(
  outcome: CaptureResult | Error,
): (request: CaptureRequest) => Promise<CaptureResult> {
  return async () => {
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
}

const meta: Meta<typeof CaptureBoxHost> = {
  title: "Capture/CaptureBoxHost",
  component: CaptureBoxHost,
  args: { isOpen: true, onClose: fn(), capture: fakeCapture(created()) },
  decorators: [withProjects("ok")],
};

export default meta;

type Story = StoryObj<typeof CaptureBoxHost>;

/** Projects loaded; type text and press Enter to capture and close. */
export const Ready: Story = {};

/** The project list could not be read: a message and Retry, never an empty picker. */
export const ProjectsFailed: Story = { decorators: [withProjects("failed")] };

/** No project exists: capture is disabled and says a project is needed. */
export const NoProjects: Story = { decorators: [withProjects("empty")] };

/** Submitting yields a captured-with-notice result: the seeding notice shows. */
export const CapturedWithSeedingNotice: Story = {
  args: { capture: fakeCapture(created("seeding")) },
};

/** Submitting yields a captured-with-notice result: the writing-log notice shows. */
export const CapturedWithWritingLogNotice: Story = {
  args: { capture: fakeCapture(created("writing-log")) },
};

/** The server refuses text over the limit; the text stays. */
export const TextTooLongRefused: Story = {
  args: {
    capture: fakeCapture({
      status: "refused",
      notices: [{ code: "text-too-long", severity: "error", message: "x" }],
    }),
  },
};

/** The app could not be reached; the text stays. */
export const NetworkFailure: Story = {
  args: { capture: fakeCapture(new TypeError("Failed to fetch")) },
};

/** The app reported an error; the text stays. */
export const ServerFailure: Story = {
  args: {
    capture: fakeCapture(new Error("Failed to capture the note (HTTP 500).")),
  },
};

/** A paired device is refused; the text stays. */
export const PairedDeviceRefused: Story = {
  args: {
    capture: fakeCapture(
      new LimitRefusalError(
        "Not allowed on a paired device.",
        "projectDeletion",
      ),
    ),
  },
};

/** The Inbox is in Trash: reported as a failure until the choice flow exists. */
export const InboxInTrashNotYetHandled: Story = {
  args: {
    capture: fakeCapture({ status: "needs-choice", state: "inbox-in-trash" }),
  },
};
