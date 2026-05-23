import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DataView from "../components/WorkArea/DataView";
import { createTextResource } from "../src/lib/models/resource";
import type {
  Project,
  TextResource,
  AnyResource,
  Folder,
} from "../src/lib/models/types";

describe("DataView", () => {
  it("shows resource count and lists resources", () => {
    const now = new Date().toISOString();
    const projects: Project[] = [
      { id: "proj_a", name: "Project A", createdAt: now, updatedAt: now },
      { id: "proj_b", name: "Project B", createdAt: now, updatedAt: now },
    ];
    const resources: TextResource[] = [
      createTextResource({
        name: "A1",
        plainText: "Content A1",
        folderId: null,
      } as any),
      createTextResource({
        name: "B1",
        plainText: "Content B1",
        folderId: null,
      } as any),
    ];

    render(<DataView projects={projects} resources={resources} />);

    const getStatValue = (label: string) => {
      const matches = screen.getAllByText(label, { exact: false });
      const statLabel = matches.find((el: HTMLElement) => {
        const parent = el.parentElement;
        return Boolean(parent && parent.querySelector(".text-gw-h1"));
      });
      if (!statLabel) return null;
      const parent = statLabel.parentElement as HTMLElement | null;
      const valueEl = parent?.querySelector(".text-gw-h1");
      return valueEl ? (valueEl.textContent?.trim() ?? null) : null;
    };

    expect(getStatValue("Resources")).toBe(String(resources.length));

    resources.forEach((r) => {
      expect(screen.getAllByText(r.name).length).toBeGreaterThanOrEqual(1);
    });
  });
});

it("shows resource count and lists resources for a single project", () => {
  const now = new Date().toISOString();
  const project: Project = {
    id: "proj_single",
    name: "Single Project",
    createdAt: now,
    updatedAt: now,
  };
  const resources: TextResource[] = [
    createTextResource({
      name: "S1",
      plainText: "Single content",
      folderId: null,
    } as any),
  ];

  render(<DataView project={project} resources={resources} />);

  const getStatValue = (label: string) => {
    const matches = screen.getAllByText(label, { exact: false });
    const statLabel = matches.find((el: HTMLElement) => {
      const parent = el.parentElement;
      return Boolean(parent && parent.querySelector(".text-gw-h1"));
    });
    if (!statLabel) return null;
    const parent = statLabel.parentElement as HTMLElement | null;
    const valueEl = parent?.querySelector(".text-gw-h1");
    return valueEl ? (valueEl.textContent?.trim() ?? null) : null;
  };

  expect(getStatValue("Resources")).toBe(String(resources.length));

  resources.forEach((r) => {
    expect(screen.getAllByText(r.name).length).toBeGreaterThanOrEqual(1);
  });
});

describe("DataView timestamps and sort", () => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const twoDaysAgo = new Date(
    now.getTime() - 2 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const project: Project = {
    id: "proj_sort",
    name: "Sort Project",
    createdAt: now.toISOString(),
  };

  const makeResource = (name: string, updatedAt: string): AnyResource =>
    ({
      id: `res-${name}`,
      slug: name,
      name,
      type: "text",
      folderId: null,
      createdAt: twoDaysAgo,
      updatedAt,
      orderIndex: 0,
    }) as unknown as AnyResource;

  it("renders resources sorted by updatedAt descending by default", () => {
    const older = makeResource("Older Chapter", twoDaysAgo);
    const newer = makeResource("Newer Chapter", oneHourAgo);
    render(<DataView project={project} resources={[older, newer]} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toContain("Newer Chapter");
    expect(items[1].textContent).toContain("Older Chapter");
  });

  it("shows a timestamp label on each resource row", () => {
    const res = makeResource("Alpha", oneHourAgo);
    render(<DataView project={project} resources={[res]} />);
    // At least one element matching a relative time label should be visible
    const timeLabels = screen.queryAllByText(/ago|just now/i);
    expect(timeLabels.length).toBeGreaterThan(0);
  });

  it("shows 'Updated' prefix in the timestamp cell", () => {
    const res = makeResource("Beta", oneHourAgo);
    render(<DataView project={project} resources={[res]} />);
    expect(screen.getByText(/Updated/i)).toBeDefined();
  });

  it("clicking Name sort button reorders resources alphabetically", () => {
    const alpha = makeResource("Alpha", twoDaysAgo);
    const zeta = makeResource("Zeta", oneHourAgo);
    render(<DataView project={project} resources={[alpha, zeta]} />);

    // Default: Zeta first (more recent)
    let items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toContain("Zeta");

    // Click Name sort
    fireEvent.click(screen.getByRole("button", { name: /name/i }));
    items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toContain("Alpha");
  });

  it("clicking Last Edited sort button restores temporal order", () => {
    const alpha = makeResource("Alpha", twoDaysAgo);
    const zeta = makeResource("Zeta", oneHourAgo);
    render(<DataView project={project} resources={[alpha, zeta]} />);

    fireEvent.click(screen.getByRole("button", { name: /name/i }));
    fireEvent.click(screen.getByRole("button", { name: /last edited/i }));
    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toContain("Zeta");
  });
});

describe("DataView stub resources", () => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const twoDaysAgo = new Date(
    now.getTime() - 2 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const project: Project = {
    id: "proj_stub",
    name: "Stub Project",
    createdAt: now.toISOString(),
  };

  const makeResource = (
    name: string,
    updatedAt: string,
    wordCount = 0,
  ): AnyResource =>
    ({
      id: `res-${name}`,
      slug: name,
      name,
      type: "text",
      folderId: null,
      createdAt: twoDaysAgo,
      updatedAt,
      wordCount,
      orderIndex: 0,
    }) as unknown as AnyResource;

  it("renders a 'Needs content' label when any resource has ≤ 50 words", () => {
    const stub = makeResource("Empty Chapter", oneHourAgo, 0);
    const content = makeResource("Full Chapter", twoDaysAgo, 500);
    render(<DataView project={project} resources={[stub, content]} />);
    expect(screen.getByText("Needs content")).toBeDefined();
  });

  it("does not render 'Needs content' when all resources have > 50 words", () => {
    const a = makeResource("Chapter 1", oneHourAgo, 100);
    const b = makeResource("Chapter 2", twoDaysAgo, 500);
    render(<DataView project={project} resources={[a, b]} />);
    expect(screen.queryByText("Needs content")).toBeNull();
  });

  it("places stub resources first in DOM order, before content resources", () => {
    const stub = makeResource("Stub One", oneHourAgo, 0);
    const content = makeResource("Full One", twoDaysAgo, 500);
    render(<DataView project={project} resources={[stub, content]} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toContain("Stub One");
  });

  it("places a resource with exactly 50 words in the stub section (boundary)", () => {
    const boundary = makeResource("Boundary Chapter", oneHourAgo, 50);
    render(<DataView project={project} resources={[boundary]} />);
    expect(screen.getByText("Needs content")).toBeDefined();
  });

  it("places a resource with exactly 51 words in the main list (boundary)", () => {
    const content = makeResource("Content Chapter", oneHourAgo, 51);
    render(<DataView project={project} resources={[content]} />);
    expect(screen.queryByText("Needs content")).toBeNull();
  });

  it("does not render 'Needs content' when resources list is empty", () => {
    render(<DataView project={project} resources={[]} />);
    expect(screen.queryByText("Needs content")).toBeNull();
  });
});

describe("DataView word count goal", () => {
  const now = new Date().toISOString();

  it("renders a progress bar when project has wordCountGoal > 0", () => {
    const project: Project = {
      id: "proj_goal",
      name: "Goal Project",
      createdAt: now,
      config: { wordCountGoal: 80000, editorConfig: { headings: {} } },
    };
    render(<DataView project={project} resources={[]} />);
    expect(screen.getByRole("progressbar")).toBeDefined();
  });

  it("does not render a progress bar when project has no wordCountGoal", () => {
    const project: Project = {
      id: "proj_no_goal",
      name: "No Goal Project",
      createdAt: now,
      config: { editorConfig: { headings: {} } },
    };
    render(<DataView project={project} resources={[]} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("does not render a progress bar when wordCountGoal is 0", () => {
    const project: Project = {
      id: "proj_zero_goal",
      name: "Zero Goal Project",
      createdAt: now,
      config: { wordCountGoal: 0, editorConfig: { headings: {} } },
    };
    render(<DataView project={project} resources={[]} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("does not render a progress bar when project has no config", () => {
    const project: Project = {
      id: "proj_no_config",
      name: "No Config Project",
      createdAt: now,
    };
    render(<DataView project={project} resources={[]} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

describe("DataView breakdown section", () => {
  const now = new Date().toISOString();
  const project: Project = {
    id: "proj_breakdown",
    name: "Breakdown Project",
    createdAt: now,
  };

  const makeResource = (
    name: string,
    folderId: string | null,
    wordCount = 500,
  ): AnyResource =>
    ({
      id: `res-${name}`,
      slug: name,
      name,
      type: "text",
      folderId,
      createdAt: now,
      updatedAt: now,
      wordCount,
      orderIndex: 0,
    }) as unknown as AnyResource;

  const makeFolder = (id: string, name: string): Folder =>
    ({
      id,
      slug: id,
      name,
      type: "folder",
      folderId: null,
      createdAt: now,
      orderIndex: 0,
    }) as unknown as Folder;

  it("does not render a Breakdown section when no folders prop is provided", () => {
    const resources = [
      makeResource("Chapter 1", null, 3000),
      makeResource("Chapter 2", null, 2000),
    ];
    render(<DataView project={project} resources={resources} />);
    expect(screen.queryByText("Breakdown")).toBeNull();
  });

  it("does not render a Breakdown section when all resources are in one folder (1 group)", () => {
    const folder = makeFolder("folder-a", "Chapters");
    const resources = [
      makeResource("Chapter 1", "folder-a", 3000),
      makeResource("Chapter 2", "folder-a", 2000),
    ];
    render(
      <DataView project={project} resources={resources} folders={[folder]} />,
    );
    expect(screen.queryByText("Breakdown")).toBeNull();
  });

  it("renders Breakdown section when resources span 2+ folders", () => {
    const folders = [
      makeFolder("folder-a", "Chapters"),
      makeFolder("folder-b", "Research"),
    ];
    const resources = [
      makeResource("Chapter 1", "folder-a", 3000),
      makeResource("Chapter 2", "folder-a", 6200),
      makeResource("Notes", "folder-b", 3400),
    ];
    render(
      <DataView project={project} resources={resources} folders={folders} />,
    );
    expect(screen.getByText("Breakdown")).toBeDefined();
  });

  it("shows folder names in breakdown rows", () => {
    const folders = [
      makeFolder("folder-a", "Chapters"),
      makeFolder("folder-b", "Research"),
    ];
    const resources = [
      makeResource("Chapter 1", "folder-a", 3000),
      makeResource("Notes", "folder-b", 3400),
    ];
    render(
      <DataView project={project} resources={resources} folders={folders} />,
    );
    expect(screen.getByText("Chapters")).toBeDefined();
    expect(screen.getByText("Research")).toBeDefined();
  });

  it("shows 'Ungrouped' for resources with no folderId alongside folder-grouped resources", () => {
    const folders = [makeFolder("folder-a", "Chapters")];
    const resources = [
      makeResource("Chapter 1", "folder-a", 3000),
      makeResource("Stray Note", null, 500),
    ];
    render(
      <DataView project={project} resources={resources} folders={folders} />,
    );
    expect(screen.getByText("Ungrouped")).toBeDefined();
  });

  it("does not render Breakdown when resources array is empty", () => {
    const folders = [makeFolder("folder-a", "Chapters")];
    render(<DataView project={project} resources={[]} folders={folders} />);
    expect(screen.queryByText("Breakdown")).toBeNull();
  });
});

describe("DataView collapsible sections", () => {
  const now = new Date().toISOString();
  const project: Project = {
    id: "proj-collapse",
    name: "Collapse Test Project",
    createdAt: now,
  };

  const makeResource = (
    name: string,
    wordCount = 500,
    folderId: string | null = null,
  ): AnyResource =>
    ({
      id: `res-${name}`,
      slug: name,
      name,
      type: "text",
      folderId,
      createdAt: now,
      updatedAt: now,
      wordCount,
      orderIndex: 0,
    }) as unknown as AnyResource;

  const makeFolder = (id: string, name: string): Folder =>
    ({
      id,
      slug: id,
      name,
      type: "folder",
      folderId: null,
      createdAt: now,
      orderIndex: 0,
    }) as unknown as Folder;

  it("renders all visible section toggle buttons by default", () => {
    const projectWithGoal: Project = {
      ...project,
      config: { wordCountGoal: 80000, editorConfig: { headings: {} } },
    };
    const folders = [
      makeFolder("f1", "Folder A"),
      makeFolder("f2", "Folder B"),
    ];
    const resources = [
      makeResource("Chapter 1", 500, null),
      makeResource("Research Note", 500, "f2"),
    ];
    render(
      <DataView
        project={projectWithGoal}
        resources={resources}
        folders={folders}
      />,
    );
    expect(
      screen.getByRole("button", { name: /overview/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /writing goal/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /breakdown/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^resources$/i }),
    ).toBeInTheDocument();
  });

  it("collapses the Data section and hides stat content", () => {
    render(
      <DataView project={project} resources={[makeResource("Chapter 1")]} />,
    );
    expect(screen.getByText("Total words")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /overview/i }));
    expect(screen.queryByText("Total words")).not.toBeInTheDocument();
  });

  it("collapses the Resources section and hides resource names", () => {
    render(<DataView project={project} resources={[makeResource("Alpha")]} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^resources$/i }));
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("hides sort buttons when the Resources section is collapsed", () => {
    render(<DataView project={project} resources={[makeResource("Alpha")]} />);
    expect(
      screen.getByRole("button", { name: /last edited/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^resources$/i }));
    expect(
      screen.queryByRole("button", { name: /last edited/i }),
    ).not.toBeInTheDocument();
  });

  it("collapses the Writing Goal section and hides the progress bar", () => {
    const projectWithGoal: Project = {
      ...project,
      config: { wordCountGoal: 80000, editorConfig: { headings: {} } },
    };
    render(<DataView project={projectWithGoal} resources={[]} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /writing goal/i }));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("collapses the Breakdown section and hides folder group labels", () => {
    const folders = [
      makeFolder("f1", "Chapters"),
      makeFolder("f2", "Research"),
    ];
    const resources = [
      makeResource("C1", 500, "f1"),
      makeResource("R1", 500, "f2"),
    ];
    render(
      <DataView project={project} resources={resources} folders={folders} />,
    );
    expect(screen.getByText("Chapters")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /breakdown/i }));
    expect(screen.queryByText("Chapters")).not.toBeInTheDocument();
  });

  it("restores Resources content after collapse then expand", () => {
    render(<DataView project={project} resources={[makeResource("Beta")]} />);
    const toggle = screen.getByRole("button", { name: /^resources$/i });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });
});
