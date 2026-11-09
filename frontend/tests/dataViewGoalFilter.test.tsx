import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import DataView, {
  useDataViewFilteredTotal,
} from "../components/WorkArea/DataView";
import type { FilteredGoalTotal } from "../src/hooks/useFilteredGoalTotal";
import { createTextResource } from "../src/lib/models/resource";
import { createSourceResource } from "../src/lib/models/resource-factory";
import type { AnyResource, Folder, Project } from "../src/lib/models/types";

vi.mock("../src/lib/api/goal-filtered-total", () => ({
  getGoalFilteredTotal: vi.fn(),
}));
import { getGoalFilteredTotal } from "../src/lib/api/goal-filtered-total";

const LABEL = "Counting selected documents";
const NO_MATCH = "No documents match your goal filter";
const UNAVAILABLE = "Total word count is unavailable";

function makeProject(wordCountGoal?: number): Project {
  return {
    id: "proj_goal_filter",
    name: "P",
    createdAt: new Date().toISOString(),
    config: wordCountGoal ? { wordCountGoal } : {},
  } as Project;
}

function resourcesOf(words: number): AnyResource[] {
  return [
    createTextResource({
      name: "A",
      plainText: "w ".repeat(words),
      folderId: null,
    } as never),
  ];
}

function filtered(state: FilteredGoalTotal["state"]): FilteredGoalTotal {
  return {
    state,
    isFiltered: state.status !== "not-filtered",
    isLoading: state.status === "loading",
    isNoMatch: state.status === "no-match",
    isUnavailable: state.status === "unavailable",
  };
}

const UNAVAILABLE_STATE = {
  status: "unavailable",
  reason: "request-failed",
} as const;

afterEach(() => vi.clearAllMocks());

describe("DataView goal bar with a goal filter", () => {
  it("shows the filtered total, not the smart-folder total, with the label before the bar in reading order", () => {
    render(
      <DataView
        project={makeProject(1000)}
        resources={resourcesOf(10)}
        filteredGoalTotal={filtered({ status: "total", total: 400 })}
      />,
    );
    expect(screen.getByText(/400 \/ 1,000 words/)).toBeInTheDocument();
    expect(screen.queryByText(/^10 \/ 1,000/)).toBeNull();
    const label = screen.getByText(LABEL);
    const bar = screen.getByRole("progressbar");
    expect(
      label.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(bar).toHaveAttribute("aria-valuenow", "400");
  });

  it("no-match shows 0, the label and the no-match line", () => {
    render(
      <DataView
        project={makeProject(1000)}
        resources={resourcesOf(10)}
        filteredGoalTotal={filtered({ status: "no-match", total: 0 })}
      />,
    );
    expect(screen.getByText("0 / 1,000 words")).toBeInTheDocument();
    expect(screen.getByText(LABEL)).toBeInTheDocument();
    expect(screen.getByText(NO_MATCH)).toBeInTheDocument();
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  });

  it("unavailable shows the line, no number, no 0 and no label", () => {
    render(
      <DataView
        project={makeProject(1000)}
        resources={resourcesOf(10)}
        filteredGoalTotal={filtered(UNAVAILABLE_STATE)}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(UNAVAILABLE);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/\/ 1,000 words/)).toBeNull();
    expect(screen.queryByText(LABEL)).toBeNull();
    expect(screen.queryByText(NO_MATCH)).toBeNull();
  });

  it("loading shows neither a number nor a failure", () => {
    render(
      <DataView
        project={makeProject(1000)}
        resources={resourcesOf(10)}
        filteredGoalTotal={filtered({ status: "loading" })}
      />,
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
    expect(screen.queryByText(/\/ 1,000 words/)).toBeNull();
  });

  it("leaves the Total words tile unchanged when a filter is set", () => {
    render(
      <DataView
        project={makeProject(1000)}
        resources={resourcesOf(10)}
        filteredGoalTotal={filtered({ status: "total", total: 400 })}
      />,
    );
    const tile = screen.getByText("Total words").parentElement as HTMLElement;
    expect(tile).toHaveTextContent("10");
    expect(tile).not.toHaveTextContent("400");
  });

  it("shows no label and no section when no goal is set", () => {
    render(
      <DataView
        project={makeProject()}
        resources={resourcesOf(10)}
        filteredGoalTotal={filtered({ status: "total", total: 400 })}
      />,
    );
    expect(screen.queryByText(LABEL)).toBeNull();
    expect(screen.queryByText("Writing Goal")).toBeNull();
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  });

  it("with no filter the bar follows the supplied resources and has no label", () => {
    render(
      <DataView
        project={makeProject(1000)}
        resources={resourcesOf(10)}
        filteredGoalTotal={filtered({ status: "not-filtered" })}
      />,
    );
    expect(screen.getByText(/^10 \/ 1,000 words/)).toBeInTheDocument();
    expect(screen.queryByText(LABEL)).toBeNull();
  });
});

describe("useDataViewFilteredTotal", () => {
  it("makes no request and is not-filtered with no filter", () => {
    const { result } = renderHook(() => useDataViewFilteredTotal("p1", false));
    expect(result.current.state.status).toBe("not-filtered");
    expect(getGoalFilteredTotal).not.toHaveBeenCalled();
  });

  it("never exposes the previous total when a filter is cleared then set", async () => {
    vi.mocked(getGoalFilteredTotal).mockResolvedValue({
      status: "total",
      total: 400,
    });
    const seen: string[] = [];
    const { result, rerender } = renderHook(
      ({ isSet }: { isSet: boolean }) => {
        const r = useDataViewFilteredTotal("p1", isSet);
        seen.push(
          r.state.status === "total"
            ? `total:${r.state.total}`
            : r.state.status,
        );
        return r;
      },
      { initialProps: { isSet: true } },
    );
    await act(async () => {});
    expect(result.current.state).toEqual({ status: "total", total: 400 });
    rerender({ isSet: false });
    seen.length = 0;
    vi.mocked(getGoalFilteredTotal).mockResolvedValue({
      status: "total",
      total: 900,
    });
    rerender({ isSet: true });
    expect(seen[0]).toBe("loading");
    expect(seen).not.toContain("total:400");
    await act(async () => {});
    expect(result.current.state).toEqual({ status: "total", total: 900 });
  });
});

describe("DataView goal bar with no goal filter (Feature 102 FR-28)", () => {
  it("leaves a Source's words out of the project goal total (Task 35, owner decision 2026-11-07)", () => {
    render(
      <DataView
        project={makeProject(1000)}
        resources={[
          ...resourcesOf(10),
          createSourceResource({
            name: "Research",
            plainText: "w ".repeat(7),
            folderId: null,
          } as never),
        ]}
      />,
    );
    expect(screen.getByText(/^10 \/ 1,000 words/)).toBeInTheDocument();
    expect(screen.queryByText(/17 \/ 1,000 words/)).toBeNull();
  });

  it("shows the supplied filtered total, which a goal filter that selects Sources has counted", () => {
    render(
      <DataView
        project={makeProject(1000)}
        resources={[
          ...resourcesOf(10),
          createSourceResource({
            name: "Research",
            plainText: "w ".repeat(7),
            folderId: null,
          } as never),
        ]}
        filteredGoalTotal={filtered({ status: "total", total: 17 })}
      />,
    );
    expect(screen.getByText(/^17 \/ 1,000 words/)).toBeInTheDocument();
  });
});

describe("DataView goal bar and the Inbox (Feature 106 FR-7, client total)", () => {
  const INBOX = "11111111-1111-4111-8111-111111111111";
  const SUB = "22222222-2222-4222-8222-222222222222";
  const OTHER = "33333333-3333-4333-8333-333333333333";
  const folder = (id: string, parentId: string | null): Folder =>
    ({ id, name: id, type: "folder", parentId }) as unknown as Folder;
  const inInbox = (id: string): AnyResource =>
    createTextResource({
      name: "Captured",
      plainText: "w ".repeat(7),
      folderId: id,
    } as never);
  const projectWithInbox = (inboxFolderId: string): Project =>
    ({
      ...makeProject(1000),
      config: { wordCountGoal: 1000, inboxFolderId },
    }) as Project;
  const folders = [
    folder(INBOX, null),
    folder(SUB, INBOX),
    folder(OTHER, null),
  ];

  it("leaves words of a text resource in the Inbox subtree out of the total", () => {
    render(
      <DataView
        project={projectWithInbox(INBOX)}
        folders={folders}
        resources={[...resourcesOf(10), inInbox(INBOX), inInbox(SUB)]}
      />,
    );
    expect(screen.getByText(/^10 \/ 1,000 words/)).toBeInTheDocument();
  });

  it("counts the words once the item is filed outside the Inbox", () => {
    render(
      <DataView
        project={projectWithInbox(INBOX)}
        folders={folders}
        resources={[...resourcesOf(10), inInbox(OTHER)]}
      />,
    );
    expect(screen.getByText(/^17 \/ 1,000 words/)).toBeInTheDocument();
  });

  it("counts everything when the project has no Inbox", () => {
    render(
      <DataView
        project={makeProject(1000)}
        folders={folders}
        resources={[...resourcesOf(10), inInbox(INBOX)]}
      />,
    );
    expect(screen.getByText(/^17 \/ 1,000 words/)).toBeInTheDocument();
  });

  it("with a goal filter the supplied filtered total alone decides", () => {
    render(
      <DataView
        project={projectWithInbox(INBOX)}
        folders={folders}
        resources={[...resourcesOf(10), inInbox(INBOX)]}
        filteredGoalTotal={filtered({ status: "total", total: 17 })}
      />,
    );
    expect(screen.getByText(/^17 \/ 1,000 words/)).toBeInTheDocument();
  });

  it("a parent cycle through the Inbox does not hang and shows unavailable, not 0", () => {
    render(
      <DataView
        project={projectWithInbox(INBOX)}
        folders={[folder(INBOX, null), folder(SUB, INBOX), folder(INBOX, SUB)]}
        resources={[...resourcesOf(10), inInbox(SUB)]}
      />,
    );
    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
    expect(screen.queryByText(/ \/ 1,000 words/)).toBeNull();
  });
});
