import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import FolderTreePicker, {
  buildFolderTree,
} from "../components/ResourceTree/FolderTreePicker";
import type { Folder } from "../src/lib/models/types";

function makeFolder(
  id: string,
  name: string,
  parentId?: string,
  folderId?: string,
): Folder {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    type: "folder",
    parentId: parentId ?? null,
    folderId: folderId ?? null,
    orderIndex: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("buildFolderTree", () => {
  it("returns empty array for no folders", () => {
    expect(buildFolderTree([])).toEqual([]);
  });

  it("returns root nodes when no parentIds are set", () => {
    const folders = [makeFolder("a", "A"), makeFolder("b", "B")];
    const tree = buildFolderTree(folders);
    expect(tree).toHaveLength(2);
    expect(tree.every((n) => n.children.length === 0)).toBe(true);
  });

  it("nests a child under its parent", () => {
    const folders = [makeFolder("a", "A"), makeFolder("b", "B", "a")];
    const tree = buildFolderTree(folders);
    expect(tree).toHaveLength(1);
    expect(tree[0].folder.id).toBe("a");
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].folder.id).toBe("b");
  });

  it("treats unknown parentId as root", () => {
    const folders = [makeFolder("b", "B", "nonexistent")];
    const tree = buildFolderTree(folders);
    expect(tree).toHaveLength(1);
    expect(tree[0].folder.id).toBe("b");
  });

  it("handles multiple levels of nesting", () => {
    const folders = [
      makeFolder("a", "A"),
      makeFolder("b", "B", "a"),
      makeFolder("c", "C", "b"),
    ];
    const tree = buildFolderTree(folders);
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].children[0].folder.id).toBe("c");
  });

  it("nests a child that parents via folderId (no parentId)", () => {
    // Real-world data: most folders express their parent through folderId,
    // not parentId. Only mishandling this would flatten the tree.
    const folders = [
      makeFolder("a", "A"),
      makeFolder("b", "B", undefined, "a"),
    ];
    const tree = buildFolderTree(folders);
    expect(tree).toHaveLength(1);
    expect(tree[0].folder.id).toBe("a");
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].folder.id).toBe("b");
  });

  it("prefers parentId over folderId when both are set", () => {
    const folders = [
      makeFolder("a", "A"),
      makeFolder("b", "B"),
      makeFolder("c", "C", "a", "b"),
    ];
    const tree = buildFolderTree(folders);
    const a = tree.find((n) => n.folder.id === "a");
    const b = tree.find((n) => n.folder.id === "b");
    expect(a?.children.map((n) => n.folder.id)).toEqual(["c"]);
    expect(b?.children).toHaveLength(0);
  });

  it("orders sibling folders by orderIndex", () => {
    const second = makeFolder("s", "Second");
    second.orderIndex = 1;
    const first = makeFolder("f", "First");
    first.orderIndex = 0;
    const tree = buildFolderTree([second, first]);
    expect(tree.map((n) => n.folder.id)).toEqual(["f", "s"]);
  });
});

describe("FolderTreePicker", () => {
  it("renders trigger with 'Project Root' when no value", () => {
    render(
      <FolderTreePicker folders={[]} value={undefined} onChange={vi.fn()} />,
    );
    expect(screen.getByText("Project Root")).toBeInTheDocument();
  });

  it("renders trigger with selected folder name", () => {
    const folders = [makeFolder("f1", "Chapter One")];
    render(
      <FolderTreePicker folders={folders} value="f1" onChange={vi.fn()} />,
    );
    expect(screen.getByText("Chapter One")).toBeInTheDocument();
  });

  it("opens popover on trigger click and shows Project Root option", () => {
    render(
      <FolderTreePicker folders={[]} value={undefined} onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button"));
    const items = screen.getAllByText("Project Root");
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it("calls onChange with undefined when Project Root is clicked", () => {
    const onChange = vi.fn();
    render(
      <FolderTreePicker
        folders={[makeFolder("f1", "Act One")]}
        value="f1"
        onChange={onChange}
      />,
    );
    // Trigger shows the selected folder name; click it to open the popover
    fireEvent.click(screen.getByText("Act One"));
    const rootOptions = screen.getAllByText("Project Root");
    const popoverOption = rootOptions[rootOptions.length - 1];
    fireEvent.click(popoverOption);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("calls onChange with folder id when a folder is clicked", () => {
    const onChange = vi.fn();
    const folders = [makeFolder("f1", "Act One")];
    render(
      <FolderTreePicker
        folders={folders}
        value={undefined}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Act One"));
    expect(onChange).toHaveBeenCalledWith("f1");
  });

  it("renders top-level folders in the tree", () => {
    const folders = [makeFolder("p", "Parent"), makeFolder("c", "Child", "p")];
    render(
      <FolderTreePicker
        folders={folders}
        value={undefined}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Parent")).toBeInTheDocument();
    expect(screen.queryByText("Child")).not.toBeInTheDocument();
  });

  it("reveals nested folders after expanding a parent", () => {
    const folders = [makeFolder("p", "Parent"), makeFolder("c", "Child", "p")];
    render(
      <FolderTreePicker
        folders={folders}
        value={undefined}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("Child")).toBeInTheDocument();
  });

  it("uses a custom rootLabel for the trigger when no value", () => {
    render(
      <FolderTreePicker
        folders={[]}
        value={undefined}
        onChange={vi.fn()}
        rootLabel="Any folder"
      />,
    );
    expect(screen.getByText("Any folder")).toBeInTheDocument();
    expect(screen.queryByText("Project Root")).not.toBeInTheDocument();
  });

  it("uses a custom rootLabel for the no-selection option", () => {
    const onChange = vi.fn();
    render(
      <FolderTreePicker
        folders={[makeFolder("f1", "Act One")]}
        value="f1"
        onChange={onChange}
        rootLabel="Any folder"
      />,
    );
    // Trigger shows the selected folder name; open the popover.
    fireEvent.click(screen.getByText("Act One"));
    const rootOptions = screen.getAllByText("Any folder");
    fireEvent.click(rootOptions[rootOptions.length - 1]);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
