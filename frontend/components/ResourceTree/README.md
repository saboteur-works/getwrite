# Resource Tree

The Resource Tree is a tree representation of all project files in the current project. Folders and individual resources should be able to be dragged and dropped within their current folder or other folders. Folders with children should be expandable.

When a Folder or Resource is right-clicked, the `ResourceContextMenu` should be activated, allowing users to take the actions within the menu.

Modifications made within the tree should be persisted on the user's filesystem.

## Library: @headless/tree

The Resource Tree is built with [Headless Tree](https://headless-tree.lukasbach.com/).

**Benefits**

- Designed for tree-based drag-and-drop behavior
- Direct React support
- Flexible state management
- Keyboard/Hotkey support
- W3 Accessible
- Featureset includes Sync/Async data loading, Item Selection, Keyboard DnD, Search, Renaming, Custom Plugins/Click Behavior

**Drawbacks**

- In beta as of 3/9/2026, breaking changes may occur
- Source data requires transformation

## Data

### Data Structure: `ResourceItemData`

The Resource Tree consumes data in the following format:

```typescript
interface ResourceItemData {
    /** The name of the resource */
    name: string;
    /** The IDs of the resource's children */
    children: string[];
    /** Whether the resource is a folder */
    isFolder: boolean;
    /** The ID of the resource's parent folder */
    parentId: string | null;
    /** Whether the resource can be moved into a new folder */
    special?: boolean;
}
```

This structure is intentionally lightweight and doesn't include the full resource, therefore, when the original resource is needed, it must be found in `rawResources`.

#### Root Node

GetWrite's native folder structure doesn't have the concept of a `root` folder. To support tree views/structures, a `root` folder must be added at runtime.

> Note: The `transformResourcesToTreeData` (see below) handles creation of the root node for the UI.

### Data Source

The Resource Tree consumes data from the Redux `resourcesSlice`, via the `selectFoldersAndResources` selector, declared as `rawResources`.

This data is the source of truth for tree data. **Care should be taken to ensure that it is always up-to-date to avoid renders that do not reflect the state of the data.**

> This data must be transformed before use in the tree via `transformResourcesToTreeData`

## Helper Functions

### `transformResourcesToTreeData(resources: AnyResource[])`

This function transforms a flat combined list of Files and Resources into the format used by the three component.

```json
{
    "root": {
        "name": "Root",
        "children": ["folder-1", "res-3"],
        "isFolder": true
    },
    "folder-1": {
        "name": "Folder 1",
        "children": ["res-1", "res-2"],
        "isFolder": true
    },
    "res-1": {
        "name": "Resource 1",
        "children": [],
        "isFolder": false
    },
    "res-2": {
        "name": "Resource 2",
        "children": [],
        "isFolder": false
    },
    "res-3": {
        "name": "Resource 3",
        "children": [],
        "isFolder": false
    }
}
```

With the exception of the `root` node, all keys in this structure are the Resource/Folder `id`s that these objects represent.

## Implementation Notes

### Data Variables

#### `rawResources: AnyResource[]`

`rawResources` is the raw Folder and Resource data available via the Redux `resourcesSlice`.

#### `transformedResourceData: Record<string, ResourceItemData>`

`transformedResourceData` is the memoized result of `transformResourcesToTreeData(rawResources)`.

## Notes

- Non-Folder resources must be located in a non-root directory.

## TODO

### Data

- [x] Resource and Folder data is pulled from Redux via the [resourcesSlice](frontend/src/store/resourcesSlice.ts)
- [x] Resource and Folder data is transformed into tree-friendly format
- [x] Tree consumes transformed data

### Non-Folder Resources

- [x] Non-Folder Resources can be dragged and dropped into new position within the same level/folder
    - [ ] Dropped Non-Folder resources render at the proper position after drop
    - [x] Dropped Non-Folder Resources `orderIndex` reflects their new position when dropped within the same level
    - [x] Siblings of dropped Non-Folder Resources have their `orderIndex` corrected as needed (ie, when the dropped item is placed before the last child)

- [x] Non-Folder Resources can be dragged and dropped into a new position in a different level/folder
    - [x] Non-Folder resources `folderId` reflect their new parent's `id`
    - [x] Non-Folder Resources `orderIndex` reflects their new position when dropped within a new folder
    - [x] Siblings of dropped Non-Folder Resources have their `orderIndex` corrected as needed (ie, when the dropped item is placed before the last child)
- [x] Changes are persisted on local filesystem

### Folders

- [x] Folders can be dragged and dropped into new position within the same level/folder
    - [ ] Folders render at the proper position after drop
    - [x] Folder's `orderIndex` reflects their new position when dropped within the same level
    - [x] Siblings of Folders have their `orderIndex` corrected as needed (ie, when the dropped item is placed before the last child)
- [x] Folders can be dragged and dropped into a new position in a different level/folder
    - [x] Folder's `folderId` reflect their new parent's `id`
    - [x] Folder's `orderIndex` reflects their new position when dropped within a new folder
    - [x] Siblings of Folders have their `orderIndex` corrected as needed (ie, when the dropped item is placed before the last child)
- [x] Folder children retain their proper `folderId` and `orderIndex` when Folders are dragged and dropped
- [x] Changes are persisted on local filesystem

## Known Issues

- Resource tree selection does not update when resource is set via a different component (ie, SearchBar)
