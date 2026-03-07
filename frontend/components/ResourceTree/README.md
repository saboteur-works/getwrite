# Resource Tree

## Library: @headless/tree

The Resource Tree is built with [Headless Tree](https://headless-tree.lukasbach.com/).

## Data

### Data Source(s)

#### `resourcesSlice`

The ResourceTree consumes data from the Redux `resourcesSlice`, via the `selectFoldersAndResources` selector.

### Special Types

#### `ResourceItemData`

The Resource Tree consumes data in the following format:

```typescript
interface ResourceItemData {
    /** The name of the resource */
    name: string;
    /** The IDs of the resource's children */
    children: string[];
    /** Whether the resource is a folder */
    isFolder: boolean;
}
```

> This structure is intentionally lightweight and doesn't include the full resource.

### IMPORTANT NODE: `root`

GetWrite's native folder structure doesn't have the concept of a `root` folder. To support tree views/structures, a `root` folder must be added at runtime.

> Note: The `transformResourcesToTreeData` handles creation of the root node for the UI.

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

## TODO

- [ ]: Update orderIndex after moves
