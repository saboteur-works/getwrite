"use client";
/**
 * @module Layout/AppShell
 *
 * Main three-pane application shell coordinating:
 * - Left pane: resource tree navigation and context actions (resizable, collapsible).
 * - Center pane: active work-area view (edit/diff/organizer/data/timeline).
 * - Right pane: metadata editing controls for the selected resource (resizable, collapsible).
 *
 * Responsibilities include view switching, modal orchestration for
 * create/export/compile flows, resizable/collapsible split panes, and debounced persistence
 * of editor content.
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import type {
  AnyResource,
  EditorBodyConfig,
  ViewName,
  Project as CanonicalProject,
  ResourceType,
  Folder,
  TipTapDocument,
  ResourceRef,
} from "../../src/lib/models/types";
import { shallowEqual } from "react-redux";
import {
  removeResource,
  selectActiveProjectMetadataSchema,
} from "../../src/store/projectsSlice";
import { setEditorConfig } from "../../src/store/editorConfigSlice";
import ResourceTree from "../ResourceTree/ResourceTree";
import SmartFolders from "../ResourceTree/SmartFolders";
import QueryBuilder from "../QueryBuilder/QueryBuilder";
import SaveQueryDialog from "../QueryBuilder/SaveQueryDialog";
import { buildFieldPickerFields } from "../QueryBuilder/FieldPicker";
import { filterResourceOptionsByScope } from "../Sidebar/folderScope";
import { astToGroups } from "../QueryBuilder/ast-chip-bridge";
import { useQueryBuilderState } from "../QueryBuilder/useQueryBuilderState";
import ShellLayoutController from "./ShellLayoutController";
import ShellSettingsMenu, {
  type SettingsMenuAction,
} from "./ShellSettingsMenu";
import ShellModalCoordinator from "./ShellModalCoordinator";
import ShellProjectTypeLoader from "./ShellProjectTypeLoader";
import type { ResourceContextAction } from "../ResourceTree/ResourceContextMenu";
import SidebarContextMenu from "../ResourceTree/SidebarContextMenu";
import ViewSwitcher from "../WorkArea/ViewSwitcher";
import EditView from "../WorkArea/EditView";
import MediaView from "../WorkArea/Media/MediaView";
import DiffViewController from "../WorkArea/DiffViewController";
import OrganizerView from "../WorkArea/Views/OrganizerView/OrganizerView";
import DataView from "../WorkArea/DataView";
import TimelineView from "../WorkArea/Views/TimelineView";
import MetadataSidebar from "../Sidebar/MetadataSidebar";
import SearchBar from "../SearchBar/SearchBar";
import debounce from "lodash/debounce";
import { tiptapToPlainText } from "../../src/lib/tiptap-text";
import { countWords } from "../../src/lib/word-count";
import {
  saveHeadingSettings,
  saveBodySettings,
} from "../../src/lib/api/editor-config";
import {
  saveProjectPreferences,
  saveRevisionSettings,
} from "../../src/lib/api/preferences";
import {
  renameResource,
  persistContent as persistResourceContent,
} from "../../src/lib/api/resources";
import {
  compilePdf,
  compileDocx,
  compileText,
} from "../../src/lib/api/compile";
import { formatRelativeTimestamp as _formatRelativeTimestamp } from "../../src/lib/timestamp-utils";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  FileText,
  Image as ImageIcon,
  Music2,
  Plus,
} from "lucide-react";
import Button from "../common/UI/Button/Button";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import {
  selectResource,
  selectResources,
  selectFolders,
  setSelectedResourceId,
  updateResource,
  updateFolder,
} from "../../src/store/resourcesSlice";
import {
  loadSavedQueries,
  evaluateQuery,
  deleteQuery,
  selectActiveQueryIds,
  selectIsEvaluating,
  selectSavedQueriesList,
  type SavedQuery,
} from "../../src/store/querySlice";
import type { QueryAST } from "../../src/lib/models/query-ast";
import {
  selectIsSavingRevision,
  selectDeletingRevisionId,
  selectFetchingRevisionId,
} from "../../src/store/revisionsSlice";
import type { SyncBlocker } from "./ShellModalCoordinator";
import {
  buildCompileTree,
  getDescendantLeafIds,
} from "../common/compileSelection";
import {
  getStoredGlobalAppearancePreferences,
  type ColorMode,
  resolvePreferredColorMode,
  saveGlobalAppearancePreferences,
  saveGlobalColorMode,
} from "../../src/lib/user-preferences";
import type { MetadataValue } from "../../src/lib/models/types";
import type { EditorHeadingMap } from "../../src/lib/editor-heading-settings";
import {
  selectEditorConfig,
  selectResolvedEditorConfig,
} from "../../src/store/editorConfigSlice";
import { toastService } from "../../src/lib/toast-service";

/**
 * Optional payload bag forwarded to `onResourceAction` callbacks.
 */
export interface AppShellResourceActionOptions {
  [key: string]: unknown;
}

/**
 * Local modal state for context-menu destructive actions.
 */
interface ContextActionState {
  open: boolean;
  action?: ResourceContextAction;
  resourceId?: string;
  resourceTitle?: string;
}

/**
 * Local modal state for resource creation flow.
 */
interface CreateModalState {
  open: boolean;
  parentId?: string;
  initialTitle?: string;
  sourceResourceId?: string;
}

/**
 * Local modal state for export preview flow.
 */
interface ExportModalState {
  open: boolean;
  resourceId?: string;
  resourceTitle?: string;
  resourceIds?: string[];
  resourceNames?: string[];
}

/**
 * Local modal state for compile preview flow.
 */
interface CompileModalState {
  open: boolean;
  resourceId?: string;
  preview?: string;
}

/**
 * Local modal state for resource rename flow.
 */
interface RenameModalState {
  open: boolean;
  resourceId?: string;
  resourceTitle?: string;
}

/**
 * Props accepted by {@link AppShell}.
 */
export interface AppShellProps {
  /** Optional fallback content rendered when no resource is selected. */
  children?: React.ReactNode;
  /** Toggles left/right sidebars and drag handles. */
  showSidebars?: boolean;
  /** Full resource list for the currently opened project. */
  resources?: AnyResource[];
  /** Folder list used by resource tree and create modal parent selector. */
  folders?: Folder[];
  /** Active project record backing current shell state. */
  project?: CanonicalProject | null;
  /** Called when a resource is selected from search/tree interactions. */
  onResourceSelect?: (id: string) => void;
  /** ID of currently selected resource (if any). */
  selectedResourceId?: string | null;
  /** Metadata callback for synopsis field updates. */
  onChangeSynopsis?: (text: string, resourceId: string) => void;
  /** Metadata callback for notes field updates. */
  onChangeNotes?: (text: string, resourceId: string) => void;
  /** Metadata callback for status updates. */
  onChangeStatus?: (
    status: "draft" | "in-review" | "published",
    resourceId: string,
  ) => void;
  /** Metadata callback for point-of-view updates. */
  onChangePOV?: (pov: ResourceRef, resourceId: string) => void;
  /** Metadata callback for dynamic metadata updates. */
  onChangeDynamicMetadata?: (
    metadata: Record<string, string[]>,
    resourceId: string,
  ) => void;
  /** Metadata callback for story date/time updates. */
  onChangeStoryDate?: (date: string, resourceId: string) => void;
  /** Metadata callback for story duration updates. */
  onChangeStoryDuration?: (duration: number | null, resourceId: string) => void;
  /** Metadata callback for story end date override updates. */
  onChangeStoryEndDate?: (endDate: string | null, resourceId: string) => void;
  /**
   * General resource action handler used by tree and modal flows.
   *
   * Examples: create, duplicate, delete, export.
   */
  onResourceAction?: (
    action: ResourceContextAction,
    resourceId?: string,
    opts?: AppShellResourceActionOptions,
  ) => Promise<void>;
  /** Closes the active project and returns to the start page. */
  onCloseProject?: () => void;
  /** Called when the user creates an image or audio resource via the modal. */
  onMediaCreateConfirmed?: (
    file: File,
    opts: { title: string; folderId?: string },
  ) => Promise<void>;
}

/**
 * Three-column app shell used in the main app and Storybook.
 *
 * Layout:
 * - Left pane: `ResourceTree` and tree actions (resizable, collapsible).
 * - Center pane: `ViewSwitcher`, search, and active work view (constant width).
 * - Right pane: `MetadataSidebar` bound to selected resource (resizable, collapsible).
 *
 * @param props - {@link AppShellProps}.
 * @returns Top-level app shell layout.
 */
export default function AppShell({
  children,
  showSidebars = true,
  resources,
  folders,
  onResourceSelect,
  selectedResourceId,
  onChangeSynopsis,
  onChangeNotes,
  onChangeStatus,
  onChangePOV,
  onChangeDynamicMetadata,
  onChangeStoryDate,
  onChangeStoryDuration,
  onChangeStoryEndDate,
  onResourceAction,
  onCloseProject,
  onMediaCreateConfirmed,
  project,
}: AppShellProps): JSX.Element {
  const [view, setView] = useState<ViewName>("edit");
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState<boolean>(false);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState<boolean>(false);
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] =
    useState<boolean>(false);
  const [isHeadingSettingsModalOpen, setIsHeadingSettingsModalOpen] =
    useState<boolean>(false);
  const [isBodySettingsModalOpen, setIsBodySettingsModalOpen] =
    useState<boolean>(false);
  const [isDefaultRevisionNameModalOpen, setIsDefaultRevisionNameModalOpen] =
    useState<boolean>(false);
  const [isProjectTypesModalOpen, setIsProjectTypesModalOpen] =
    useState<boolean>(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState<boolean>(false);
  const [isTagsManagerOpen, setIsTagsManagerOpen] = useState<boolean>(false);
  const [isSchemaManagerOpen, setIsSchemaManagerOpen] =
    useState<boolean>(false);
  const [isResourcePaletteOpen, setIsResourcePaletteOpen] =
    useState<boolean>(false);
  const [colorMode, setColorMode] = useState<ColorMode>("light");
  const [hasUnsavedEditorChanges, setHasUnsavedEditorChanges] =
    useState<boolean>(false);
  const [isCloseProjectConfirmOpen, setIsCloseProjectConfirmOpen] =
    useState<boolean>(false);
  const [activeSmartFolderId, setActiveSmartFolderId] = useState<string | null>(
    null,
  );
  const [queryBuilderOpen, setQueryBuilderOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [editingQuery, setEditingQuery] = useState<SavedQuery | null>(null);
  const latestEditorEditVersionRef = useRef<number>(0);
  const combined = React.useMemo(() => {
    return [...(resources ?? []), ...(folders ?? [])];
  }, [resources, folders]);
  const selectedResource = useAppSelector(
    (state) => selectResource(state.resources),
    shallowEqual,
  );
  const liveResources = useAppSelector((s) => selectResources(s.resources));
  const liveFolders = useAppSelector((s) => selectFolders(s.resources));
  const activeQueryIds = useAppSelector(selectActiveQueryIds);
  const isQueryEvaluating = useAppSelector(selectIsEvaluating);
  const metadataSchema = useAppSelector(selectActiveProjectMetadataSchema);
  const savedQueriesList = useAppSelector(selectSavedQueriesList);
  const liveEditorConfig = useAppSelector(selectEditorConfig);
  const resolvedEditorConfig = useAppSelector(selectResolvedEditorConfig);
  const qb = useQueryBuilderState();
  const availableFields = React.useMemo(
    () => buildFieldPickerFields(metadataSchema),
    [metadataSchema],
  );
  const resolveResourceOptions = React.useCallback(
    (refFolder: string | undefined, includeSubfolders?: boolean) => {
      return filterResourceOptionsByScope(
        (liveResources ?? []).map((r) => ({
          id: r.id,
          name: r.name ?? "",
          folderId: r.folderId,
        })),
        liveFolders ?? [],
        refFolder,
        includeSubfolders,
      );
    },
    [liveResources, liveFolders],
  );

  const resolveFolderOptions = React.useCallback(() => {
    return (liveFolders ?? [])
      .filter((f) => f.name)
      .map((f) => ({ id: f.id, name: f.name }));
  }, [liveFolders]);
  const currentAst = React.useMemo(
    () =>
      qb.isAdvanced && qb.rawAst
        ? qb.rawAst
        : (qb.buildAst() ?? { op: "and" as const, children: [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qb.isAdvanced, qb.rawAst, qb.groups, qb.globalCombinator],
  );

  useEffect(() => {
    if (selectedResource?.type === "text") {
      setView((current) => (current === "organizer" ? "edit" : current));
      setActiveSmartFolderId(null);
      setQueryBuilderOpen(false);
    } else if (selectedResource?.type === "folder") {
      setView((current) =>
        current === "edit" || current === "diff" ? "organizer" : current,
      );
      setActiveSmartFolderId(null);
      setQueryBuilderOpen(false);
    }
  }, [selectedResource?.id, selectedResource?.type]);

  const isSavingRevision = useAppSelector(selectIsSavingRevision);
  const deletingRevisionId = useAppSelector(selectDeletingRevisionId);
  const fetchingRevisionId = useAppSelector(selectFetchingRevisionId);
  const [recentTimestampTick, setRecentTimestampTick] = useState<number>(
    Date.now(),
  );

  const recentResources = React.useMemo(() => {
    return [...liveResources]
      .filter((resource) => resource.type !== "folder")
      .sort((left, right) => {
        const leftTimestamp = Date.parse(
          left.updatedAt ?? left.createdAt ?? "",
        );
        const rightTimestamp = Date.parse(
          right.updatedAt ?? right.createdAt ?? "",
        );
        const leftSafe = Number.isNaN(leftTimestamp) ? 0 : leftTimestamp;
        const rightSafe = Number.isNaN(rightTimestamp) ? 0 : rightTimestamp;
        return rightSafe - leftSafe;
      })
      .slice(0, 6);
  }, [liveResources]);

  const syncBlockers = React.useMemo<SyncBlocker[]>(() => {
    const blockers: SyncBlocker[] = [];
    if (hasUnsavedEditorChanges)
      blockers.push({ id: "editor-content", label: "Editor content" });
    if (isSavingRevision)
      blockers.push({ id: "revision-save", label: "Saving revision" });
    if (deletingRevisionId)
      blockers.push({ id: "revision-delete", label: "Deleting revision" });
    if (fetchingRevisionId)
      blockers.push({
        id: "revision-fetch",
        label: "Loading revision preview",
      });
    return blockers;
  }, [
    hasUnsavedEditorChanges,
    isSavingRevision,
    deletingRevisionId,
    fetchingRevisionId,
  ]);

  const formatRelativeTimestamp = React.useCallback(
    (timestamp: string | undefined): string =>
      _formatRelativeTimestamp(timestamp, recentTimestampTick),
    [recentTimestampTick],
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRecentTimestampTick(Date.now());
    }, 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  /**
   * Extracts a best-effort display name from resource-like objects.
   *
   * @param r - Resource-like object that may expose `name` or `title`.
   * @returns Resolved display name, or empty string when unavailable.
   */
  const getResourceName = (
    r: { name?: string; title?: string } | null | undefined,
  ): string => (r && (r.name ?? r.title ?? "")) || "";

  /**
   * Returns plain-text content used by edit/diff views.
   *
   * @param r - Resource-like object containing persisted plain-text content.
   * @returns Plain-text content for view rendering.
   */
  const getResourceContent = (r: unknown): string | undefined =>
    (r as { plaintext?: string } | null | undefined)?.plaintext;

  const [contextAction, setContextAction] = useState<ContextActionState>({
    open: false,
  });

  /**
   * Handles context-menu actions from `ResourceTree` and routes them to
   * confirmation/modals or forwards directly to `onResourceAction`.
   *
   * @param action - Requested context action.
   * @param resourceId - Target resource id for the action (when applicable).
   * @param resourceTitle - Optional resource title used by modal labels.
   */
  const handleResourceAction = async (
    action: ResourceContextAction,
    resourceId?: string,
    resourceTitle?: string,
  ) => {
    // For destructive actions show a confirmation dialog.
    if (action === "delete") {
      setContextAction({ open: true, action, resourceId, resourceTitle });
      return;
    }

    // For create/copy/duplicate/show modals locally and confirm before forwarding
    if (action === "create") {
      const clickedItem = combined.find((r) => r.id === resourceId);
      const isFolder = clickedItem?.type === "folder";
      const effectiveParentId = isFolder
        ? resourceId
        : ((clickedItem as AnyResource & { folderId?: string })?.folderId ??
          undefined);
      setCreateModal({
        open: true,
        parentId: effectiveParentId,
        initialTitle: "",
      });
      return;
    }

    if (action === "copy" || action === "duplicate") {
      setCreateModal({
        open: true,
        sourceResourceId: resourceId,
        initialTitle: `${resourceTitle ?? "Resource"} (Copy)`,
      });
      return;
    }

    if (action === "rename") {
      setRenameModal({ open: true, resourceId, resourceTitle });
      return;
    }

    if (action === "smart-folder") {
      handleNewQuery();
      return;
    }

    if (action === "export") {
      const allItems = [...(resources ?? []), ...(folders ?? [])];
      const nameById = new Map(allItems.map((r) => [r.id, r.name]));
      const isFolder = (folders ?? []).some((f) => f.id === resourceId);
      let resolvedIds: string[] = [];
      if (resourceId) {
        if (isFolder) {
          const tree = buildCompileTree(allItems);
          resolvedIds = getDescendantLeafIds(resourceId, tree);
        } else {
          resolvedIds = [resourceId];
        }
      }
      const resolvedTitle = nameById.get(resourceId ?? "") ?? resourceTitle;
      const resolvedNames = resolvedIds.map((id) => nameById.get(id) ?? id);
      setExportModal({
        open: true,
        resourceId,
        resourceTitle: resolvedTitle,
        resourceIds: resolvedIds,
        resourceNames: resolvedNames,
      });
      return;
    }

    // Fallback forward
    await onResourceAction?.(action, resourceId);
  };

  const [createModal, setCreateModal] = useState<CreateModalState>({
    open: false,
  });
  const [exportModal, setExportModal] = useState<ExportModalState>({
    open: false,
  });
  const [compileModal, setCompileModal] = useState<CompileModalState>({
    open: false,
  });
  const [renameModal, setRenameModal] = useState<RenameModalState>({
    open: false,
  });

  const handleRenameConfirm = async (newName: string): Promise<void> => {
    if (!renameModal.resourceId || !project?.rootPath) return;
    const resourceId = renameModal.resourceId;
    const isFolder = (folders ?? []).some((f) => f.id === resourceId);
    try {
      const ok = await renameResource(
        resourceId,
        project.rootPath,
        newName,
        isFolder ? "folder" : "resource",
      );
      if (!ok) return;
      if (isFolder) {
        dispatch(updateFolder({ id: resourceId, name: newName }));
      } else {
        dispatch(updateResource({ id: resourceId, name: newName }));
      }
    } finally {
      setRenameModal({ open: false });
    }
  };

  /**
   * Handles create-modal confirmation and forwards creation payload upstream.
   *
   * @param payload - Creation payload from `CreateResourceModal`.
   * @param parentId - Optional parent resource/folder id for nesting.
   * @param _opts - Optional callback options from modal (currently unused).
   */
  const handleCreateConfirmed = async (
    payload: { title: string; type: ResourceType | string; folderId?: string },
    parentId?: string,
  ) => {
    if (createModal.sourceResourceId) {
      await onResourceAction?.("copy", createModal.sourceResourceId, {
        title: payload.title,
      });
    } else {
      await onResourceAction?.("create", parentId, payload);
    }
    setCreateModal({ open: false });
  };

  /**
   * Handles export preview confirmation and forwards export action upstream.
   *
   * @param resourceIds - Resolved leaf resource IDs to export.
   * @param resourceId - The original right-clicked node (folder or leaf).
   */
  const handleExportConfirmed = async (
    resourceIds: string[],
    resourceId?: string,
  ) => {
    await onResourceAction?.("export", resourceId, { resourceIds });
    setExportModal({ open: false });
  };

  const _prevProjectId = React.useRef<string | undefined | null>(undefined);
  useEffect(() => {
    if (_prevProjectId.current !== project?.id) {
      _prevProjectId.current = project?.id;
    }
  }, [project?.id]);
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (project?.id) {
      dispatch(loadSavedQueries({ projectId: project.id }));
    }
  }, [project?.id, dispatch]);

  const handleSmartFolderSelect = (query: SavedQuery): void => {
    if (!project?.id) return;
    setActiveSmartFolderId(query.id);
    setView("data");
    dispatch(
      evaluateQuery({
        projectId: project.id,
        definition: query.definition as QueryAST,
      }),
    );
    // Pre-populate QueryBuilder with the query so the user can refine it
    const restored = astToGroups(
      query.definition as QueryAST,
      availableFields,
      savedQueriesList,
    );
    if (restored) {
      qb.reset({
        groups: restored.groups,
        combinator: restored.globalCombinator,
      });
    } else {
      qb.reset({ rawAst: query.definition as QueryAST });
    }
    setEditingQuery(query);
    setQueryBuilderOpen(true);
  };

  const handleNewQuery = (): void => {
    qb.reset();
    setEditingQuery(null);
    setActiveSmartFolderId(null);
    setQueryBuilderOpen(true);
    setView("data");
  };

  const handleEditQuery = (query: SavedQuery): void => {
    const restored = astToGroups(
      query.definition as QueryAST,
      availableFields,
      savedQueriesList,
    );
    if (restored) {
      qb.reset({
        groups: restored.groups,
        combinator: restored.globalCombinator,
      });
    } else {
      qb.reset({ rawAst: query.definition as QueryAST });
    }
    setEditingQuery(query);
    setQueryBuilderOpen(true);
    setActiveSmartFolderId(query.id);
    setView("data");
    if (project?.id) {
      dispatch(
        evaluateQuery({
          projectId: project.id,
          definition: query.definition as QueryAST,
        }),
      );
    }
  };

  const handleDeleteQuery = (queryId: string): void => {
    if (!project?.id) return;
    dispatch(deleteQuery({ projectId: project.id, queryId }));
    if (activeSmartFolderId === queryId) {
      setActiveSmartFolderId(null);
      setQueryBuilderOpen(false);
      setEditingQuery(null);
    }
  };

  const handleSaveRequest = (): void => {
    setSaveDialogOpen(true);
  };

  const handleQuerySaved = (savedId: string): void => {
    setSaveDialogOpen(false);
    setEditingQuery(null);
    if (!project?.id) return;
    setActiveSmartFolderId(savedId);
    dispatch(evaluateQuery({ projectId: project.id, definition: currentAst }));
  };

  /**
   * Persists editor content to resource API using debounced transport.
   *
   * Guard clauses ensure this only runs for open projects with selected
   * resources and known `rootPath`.
   *
   * @param doc - Current TipTap document snapshot to persist.
   */
  const persistContent = useCallback(
    async (doc: TipTapDocument, editVersion: number): Promise<void> => {
      if (!project || !selectedResourceId) {
        setHasUnsavedEditorChanges(false);
        return;
      }
      if (!project.rootPath) {
        setHasUnsavedEditorChanges(false);
        return;
      }

      try {
        await persistResourceContent(selectedResourceId, project.rootPath, doc);

        const wordCount = countWords(tiptapToPlainText(doc));
        dispatch(updateResource({ id: selectedResourceId, wordCount }));

        if (latestEditorEditVersionRef.current === editVersion) {
          setHasUnsavedEditorChanges(false);
        }
      } catch (err) {
        console.error("Failed to persist content:", err);
        setHasUnsavedEditorChanges(true);
      }
    },
    [project, selectedResourceId, dispatch],
  );

  /**
   * Debounced content persistence function to limit API write frequency while
   * users are typing.
   */
  const debouncedPersistContent = React.useMemo(
    () => debounce(persistContent, 2500),
    [persistContent],
  );

  /**
   * Editor change handler that feeds updates into debounced persistence.
   *
   * @param content - Latest plain-text content.
   * @param doc - Latest TipTap document snapshot.
   */
  const handlerEditorChange = (_content: string, doc: TipTapDocument) => {
    latestEditorEditVersionRef.current += 1;
    const nextEditVersion = latestEditorEditVersionRef.current;
    setHasUnsavedEditorChanges(true);
    debouncedPersistContent(doc, nextEditVersion);
  };

  useEffect(() => {
    return () => {
      debouncedPersistContent.cancel(); // Cancel any pending debounced calls
    };
  }, [debouncedPersistContent]);

  useEffect(() => {
    setHasUnsavedEditorChanges(false);
    latestEditorEditVersionRef.current = 0;
  }, [project?.id, selectedResourceId]);

  useEffect(() => {
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      const isCommandPaletteShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";

      if (isCommandPaletteShortcut) {
        event.preventDefault();
        setIsSettingsMenuOpen(false);
        setIsResourcePaletteOpen(true);
        return;
      }

      if (event.key === "Escape") {
        setIsPreferencesModalOpen(false);
        setIsProjectTypesModalOpen(false);
        setIsHelpModalOpen(false);
        setIsResourcePaletteOpen(false);
      }
    };

    document.addEventListener("keydown", onDocumentKeyDown);

    return () => {
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, []);

  useEffect(() => {
    const metadata = project?.metadata as
      | Record<string, MetadataValue>
      | undefined;
    setColorMode(resolvePreferredColorMode(metadata));
  }, [project?.id, project?.metadata]);

  const isDarkMode = colorMode === "dark";
  const persistColorModePreference = async (
    nextMode: ColorMode,
  ): Promise<void> => {
    const appearance = getStoredGlobalAppearancePreferences();
    saveGlobalAppearancePreferences({
      ...appearance,
      colorModePreference: nextMode,
    });
    saveGlobalColorMode(nextMode);

    if (!project?.rootPath) {
      return;
    }

    try {
      await saveProjectPreferences(project.rootPath, { colorMode: nextMode });
    } catch (error) {
      console.error("Failed to persist project user preferences", error);
    }
  };

  const handleToggleColorMode = () => {
    setColorMode((previous) => {
      const nextMode: ColorMode = previous === "dark" ? "light" : "dark";
      void persistColorModePreference(nextMode);
      return nextMode;
    });
  };

  const handleSettingsMenuAction = (action: SettingsMenuAction): void => {
    switch (action) {
      case "preferences":
        setIsSettingsMenuOpen(false);
        setIsPreferencesModalOpen(true);
        break;
      case "heading-styles":
        setIsSettingsMenuOpen(false);
        setIsHeadingSettingsModalOpen(true);
        break;
      case "body-text-styles":
        setIsSettingsMenuOpen(false);
        setIsBodySettingsModalOpen(true);
        break;
      case "default-revision-name":
        setIsSettingsMenuOpen(false);
        setIsDefaultRevisionNameModalOpen(true);
        break;
      case "project-type-manager":
        setIsSettingsMenuOpen(false);
        setIsProjectTypesModalOpen(true);
        break;
      case "tags-manager":
        setIsSettingsMenuOpen(false);
        setIsTagsManagerOpen(true);
        break;
      case "metadata":
        setIsSettingsMenuOpen(false);
        setIsSchemaManagerOpen(true);
        break;
      case "toggle-color-mode":
        handleToggleColorMode();
        break;
      case "help":
        setIsSettingsMenuOpen(false);
        setIsHelpModalOpen(true);
        break;
      case "close-project":
        handleCloseProject();
        break;
      case "compile":
        setIsProjectMenuOpen(false);
        setCompileModal({ open: true });
        break;
    }
  };

  const handleCloseProject = (): void => {
    setIsSettingsMenuOpen(false);
    setIsHeadingSettingsModalOpen(false);
    setIsPreferencesModalOpen(false);
    setIsProjectTypesModalOpen(false);
    setIsHelpModalOpen(false);

    if (syncBlockers.length > 0) {
      setIsCloseProjectConfirmOpen(true);
      return;
    }

    onCloseProject?.();
  };

  const handleConfirmCloseProject = (): void => {
    setIsCloseProjectConfirmOpen(false);
    setHasUnsavedEditorChanges(false);
    debouncedPersistContent.cancel();
    onCloseProject?.();
  };

  const handleSaveHeadingSettings = async (
    headings: EditorHeadingMap,
  ): Promise<void> => {
    if (!project?.rootPath) {
      throw new Error("Project path unavailable for heading settings.");
    }

    const body = await saveHeadingSettings(project.rootPath, headings);
    dispatch(
      setEditorConfig({
        headings: body.editorConfig?.headings ?? {},
        body: body.editorConfig?.body,
      }),
    );
  };

  const handleSaveBodySettings = async (
    bodyConfig: EditorBodyConfig,
  ): Promise<void> => {
    if (!project?.rootPath) {
      throw new Error("Project path unavailable for body settings.");
    }

    const responseBody = await saveBodySettings(project.rootPath, bodyConfig);
    dispatch(
      setEditorConfig({
        headings: responseBody.editorConfig?.headings ?? {},
        body: responseBody.editorConfig?.body,
      }),
    );
  };

  const handleSaveDefaultRevisionName = async (name: string): Promise<void> => {
    if (!project?.rootPath) {
      throw new Error("Project path unavailable.");
    }
    await saveRevisionSettings(project.rootPath, name);
  };

  return (
    <div
      className={`appshell-shell ${isDarkMode ? "appshell-theme-dark" : ""}`}
    >
      <ShellSettingsMenu
        projectName={project?.name}
        isDarkMode={isDarkMode}
        isOpen={isSettingsMenuOpen}
        onClose={() => setIsSettingsMenuOpen(false)}
        onToggleOpen={() => setIsSettingsMenuOpen((prev) => !prev)}
        hasProject={Boolean(project)}
        isProjectMenuOpen={isProjectMenuOpen}
        onCloseProjectMenu={() => setIsProjectMenuOpen(false)}
        onToggleProjectMenuOpen={() => setIsProjectMenuOpen((prev) => !prev)}
        onAction={handleSettingsMenuAction}
      />

      <ShellLayoutController>
        {(layout) => (
          <div className="appshell-body">
            {/* Left Sidebar */}
            {showSidebars && layout.leftOpen ? (
              <aside
                className="hidden sm:flex appshell-sidebar border-r"
                style={{ width: layout.leftWidth }}
              >
                <div className="appshell-sidebar-header">
                  <span className="font-mono text-gw-nano uppercase tracking-label-wide font-semibold text-gw-secondary">
                    Resources
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => layout.setLeftOpen(false)}
                    title="Close left sidebar"
                    aria-label="Close resource sidebar"
                  >
                    <PanelLeftClose size={16} aria-hidden="true" />
                  </Button>
                </div>
                {project ? (
                  <SidebarContextMenu
                    className="appshell-sidebar-content"
                    onCreateResource={() => handleResourceAction("create")}
                    onCreateSmartFolder={handleNewQuery}
                  >
                    <ResourceTree
                      debug={false}
                      onResourceAction={handleResourceAction}
                    />
                    <SmartFolders
                      selectedQueryId={activeSmartFolderId ?? undefined}
                      onSelect={handleSmartFolderSelect}
                      onNewQuery={handleNewQuery}
                      onEditQuery={handleEditQuery}
                      onDeleteQuery={handleDeleteQuery}
                    />
                  </SidebarContextMenu>
                ) : (
                  <div className="appshell-sidebar-content space-y-2">
                    <p>Loading Resource Tree</p>
                  </div>
                )}
              </aside>
            ) : null}

            {/* Left Sidebar Collapsed Toggle */}
            {showSidebars && !layout.leftOpen ? (
              <div className="hidden sm:flex flex-col items-center justify-start h-full p-2 bg-gw-chrome border-r border-hairline border-gw-border">
                <Button
                  variant="icon"
                  className="w-10 h-10"
                  onClick={() => layout.setLeftOpen(true)}
                  title="Open left sidebar"
                  aria-label="Open resource sidebar"
                >
                  <PanelLeftOpen size={16} aria-hidden="true" />
                </Button>
              </div>
            ) : null}

            <ShellProjectTypeLoader isOpen={isProjectTypesModalOpen}>
              {({
                projectTypeTemplates,
                isProjectTypesLoading,
                projectTypesLoadError,
              }) => (
                <ShellModalCoordinator
                  contextAction={contextAction}
                  setContextAction={setContextAction}
                  isCloseProjectConfirmOpen={isCloseProjectConfirmOpen}
                  setIsCloseProjectConfirmOpen={setIsCloseProjectConfirmOpen}
                  createModal={createModal}
                  setCreateModal={setCreateModal}
                  exportModal={exportModal}
                  setExportModal={setExportModal}
                  compileModal={compileModal}
                  setCompileModal={setCompileModal}
                  renameModal={renameModal}
                  setRenameModal={setRenameModal}
                  onRenameConfirm={handleRenameConfirm}
                  isHeadingSettingsModalOpen={isHeadingSettingsModalOpen}
                  setIsHeadingSettingsModalOpen={setIsHeadingSettingsModalOpen}
                  initialHeadingSettings={resolvedEditorConfig.headings}
                  isBodySettingsModalOpen={isBodySettingsModalOpen}
                  setIsBodySettingsModalOpen={setIsBodySettingsModalOpen}
                  initialBodySettings={liveEditorConfig.body}
                  onSaveBodySettings={handleSaveBodySettings}
                  isDefaultRevisionNameModalOpen={
                    isDefaultRevisionNameModalOpen
                  }
                  setIsDefaultRevisionNameModalOpen={
                    setIsDefaultRevisionNameModalOpen
                  }
                  initialDefaultRevisionName={
                    project?.config?.defaultRevisionName ?? "Initial Draft"
                  }
                  onSaveDefaultRevisionName={handleSaveDefaultRevisionName}
                  isPreferencesModalOpen={isPreferencesModalOpen}
                  setIsPreferencesModalOpen={setIsPreferencesModalOpen}
                  isHelpModalOpen={isHelpModalOpen}
                  setIsHelpModalOpen={setIsHelpModalOpen}
                  isProjectTypesModalOpen={isProjectTypesModalOpen}
                  setIsProjectTypesModalOpen={setIsProjectTypesModalOpen}
                  isTagsManagerOpen={isTagsManagerOpen}
                  setIsTagsManagerOpen={setIsTagsManagerOpen}
                  projectPath={project?.rootPath}
                  isSchemaManagerOpen={isSchemaManagerOpen}
                  setIsSchemaManagerOpen={setIsSchemaManagerOpen}
                  isResourcePaletteOpen={isResourcePaletteOpen}
                  setIsResourcePaletteOpen={setIsResourcePaletteOpen}
                  isProjectTypesLoading={isProjectTypesLoading}
                  projectTypesLoadError={projectTypesLoadError}
                  projectTypeTemplates={projectTypeTemplates}
                  resources={resources}
                  folders={liveFolders}
                  project={project}
                  hasUnsavedEditorChanges={hasUnsavedEditorChanges}
                  syncBlockers={syncBlockers}
                  onSaveHeadingSettings={handleSaveHeadingSettings}
                  onDeleteConfirm={async (resourceId) => {
                    if (project) {
                      dispatch(
                        removeResource({ projectId: project.id, resourceId }),
                      );
                    }
                    await onResourceAction?.("delete", resourceId);
                  }}
                  onCloseProjectConfirm={handleConfirmCloseProject}
                  onCreateConfirmed={async (payload, parentId) => {
                    await handleCreateConfirmed(payload, parentId);
                  }}
                  onMediaCreateConfirmed={onMediaCreateConfirmed}
                  onExportConfirmed={async (resourceIds, resourceId) => {
                    await handleExportConfirmed(resourceIds, resourceId);
                  }}
                  onSelectResource={onResourceSelect}
                  onBuildCompilePreview={(resourceId) => {
                    const resource = resourceId
                      ? resources?.find((x) => x.id === resourceId)
                      : undefined;
                    if (resource) {
                      return (
                        `Compiled package for ${getResourceName(resource)}\n\n` +
                        JSON.stringify(resource, null, 2)
                      );
                    }
                    return (
                      "Compiled project bundle\n\n" +
                      JSON.stringify(resources ?? [], null, 2)
                    );
                  }}
                  onConfirmCompile={async (selectedIds, options) => {
                    if (!project?.rootPath) return;
                    const compileBody = {
                      projectPath: project.rootPath,
                      resourceIds: selectedIds,
                      resources: (resources ?? []).map((r) => ({
                        id: r.id,
                        name: r.name,
                        type: r.type,
                      })),
                      includeHeaders: options.includeHeaders,
                      projectName: project.name ?? "project",
                    };
                    const rawName = options.compilationName.trim();
                    try {
                      if (options.format === "pdf") {
                        const result = await compilePdf(compileBody);
                        if (result.warning === "font-fallback") {
                          toastService.info(
                            "PDF compiled with fallback fonts — IBM Plex fonts were unreachable",
                          );
                        }
                        const blob = new Blob([result.arrayBuffer], {
                          type: "application/pdf",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = rawName
                          ? rawName.endsWith(".pdf")
                            ? rawName
                            : `${rawName}.pdf`
                          : result.filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        return;
                      }
                      if (options.format === "docx") {
                        const result = await compileDocx(compileBody);
                        const blob = new Blob([result.arrayBuffer], {
                          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = rawName
                          ? rawName.endsWith(".docx")
                            ? rawName
                            : `${rawName}.docx`
                          : result.filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        return;
                      }
                      const result = await compileText(compileBody);
                      const blob = new Blob([result.text], {
                        type: "text/plain;charset=utf-8",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = rawName
                        ? rawName.endsWith(".txt")
                          ? rawName
                          : `${rawName}.txt`
                        : result.filename;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch (err) {
                      toastService.error(
                        "Compile failed",
                        err instanceof Error ? err.message : String(err),
                      );
                    }
                  }}
                />
              )}
            </ShellProjectTypeLoader>

            {/* Left Resize Handle */}
            {showSidebars && layout.leftOpen ? (
              <div
                role="separator"
                aria-orientation="vertical"
                onMouseDown={layout.startLeftResize}
                className="hidden sm:block appshell-resize-handle"
              />
            ) : null}

            {/* Main Work Area */}
            <main className="appshell-work-area">
              <div className="appshell-work-area-content">
                {resources ? (
                  <div className="shrink-0 w-full">
                    <div className="workarea-header border-b-hairline border-b-gw-border">
                      <ViewSwitcher
                        view={view}
                        onChange={setView}
                        disabledViews={(() => {
                          const disabled: ViewName[] = [];
                          if (!selectedResource) {
                            disabled.push("edit", "diff");
                          }
                          if (selectedResource?.type !== "text") {
                            disabled.push("edit", "diff");
                          }
                          if (selectedResource?.type !== "folder") {
                            disabled.push("organizer");
                          }
                          return Array.from(new Set(disabled));
                        })()}
                      />
                      <div style={{ width: 320 }}>
                        <SearchBar onSelect={(id) => onResourceSelect?.(id)} />
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="flex-1 min-h-0 max-w-full mx-auto w-full flex flex-col">
                  <div
                    className={`flex-1 min-h-0 text-gw-primary flex flex-col ${
                      view === "edit" &&
                      Boolean(selectedResource) &&
                      (selectedResource?.type === "text" ||
                        selectedResource?.type === "image" ||
                        selectedResource?.type === "audio")
                        ? ""
                        : "overflow-y-auto"
                    }`}
                  >
                    {/* If a resource is selected, or the data view is active, render the chosen view; otherwise render empty state or children. */}
                    {(selectedResource && combined) || view === "data"
                      ? (() => {
                          if (view === "data") {
                            const queryResources = activeSmartFolderId
                              ? liveResources.filter((r) =>
                                  activeQueryIds.includes(r.id),
                                )
                              : liveResources;
                            return (
                              <>
                                {queryBuilderOpen && (
                                  <div className="mb-4">
                                    <QueryBuilder
                                      groups={qb.groups}
                                      globalCombinator={qb.globalCombinator}
                                      isAdvanced={qb.isAdvanced}
                                      rawAst={qb.rawAst}
                                      availableFields={availableFields}
                                      savedQueries={savedQueriesList}
                                      resolveResourceOptions={
                                        resolveResourceOptions
                                      }
                                      resolveFolderOptions={
                                        resolveFolderOptions
                                      }
                                      matchCount={
                                        activeSmartFolderId
                                          ? queryResources.length
                                          : undefined
                                      }
                                      onGlobalCombinatorChange={
                                        qb.onGlobalCombinatorChange
                                      }
                                      onGroupCombinatorChange={
                                        qb.onGroupCombinatorChange
                                      }
                                      onGroupAdd={qb.onGroupAdd}
                                      onGroupDelete={qb.onGroupDelete}
                                      onChipUpdate={qb.onChipUpdate}
                                      onChipAdd={qb.onChipAdd}
                                      onChipDelete={qb.onChipDelete}
                                      onChipDuplicate={qb.onChipDuplicate}
                                      onChipReorder={qb.onChipReorder}
                                      onRestoreFromAdvanced={
                                        qb.onRestoreFromAdvanced
                                      }
                                      onSaveRequest={handleSaveRequest}
                                    />
                                    <SaveQueryDialog
                                      isOpen={saveDialogOpen}
                                      definition={currentAst}
                                      projectId={project?.id ?? ""}
                                      onClose={() => setSaveDialogOpen(false)}
                                      onSaved={handleQuerySaved}
                                      existingQuery={editingQuery ?? undefined}
                                    />
                                  </div>
                                )}
                                <DataView
                                  resources={queryResources}
                                  project={project ?? undefined}
                                  folders={liveFolders}
                                  isEvaluating={
                                    activeSmartFolderId
                                      ? isQueryEvaluating
                                      : false
                                  }
                                  onResourceClick={(id) => {
                                    dispatch(setSelectedResourceId(id));
                                    const clicked = queryResources.find(
                                      (r) => r.id === id,
                                    );
                                    if (clicked?.type === "text") {
                                      setView("edit");
                                    }
                                    if (activeSmartFolderId) {
                                      setActiveSmartFolderId(null);
                                      setQueryBuilderOpen(false);
                                    }
                                  }}
                                  onSelectFolder={(folderId) => {
                                    dispatch(setSelectedResourceId(folderId));
                                    setView("organizer");
                                  }}
                                />
                              </>
                            );
                          }

                          if (!selectedResource)
                            return (
                              <div>
                                <h2 className="workarea-section-title">
                                  Work Area
                                </h2>
                                <p className="mt-2 text-sm text-gw-secondary">
                                  Resource not found.
                                </p>
                              </div>
                            );

                          switch (view) {
                            case "edit":
                              if (
                                selectedResource.type === "image" ||
                                selectedResource.type === "audio"
                              ) {
                                return (
                                  <MediaView resource={selectedResource} />
                                );
                              }
                              if (selectedResource.type !== "text") {
                                return (
                                  <div>
                                    <h2 className="text-2xl font-semibold">
                                      Work Area
                                    </h2>
                                    <p className="mt-2 text-sm text-gw-secondary">
                                      Selected resource is not a text resource.
                                    </p>
                                  </div>
                                );
                              }
                              return (
                                <EditView
                                  onChange={handlerEditorChange}
                                  initialContent={getResourceContent(
                                    selectedResource,
                                  )}
                                />
                              );
                            case "diff":
                              return <DiffViewController />;
                            case "organizer":
                              return <OrganizerView />;
                            case "timeline":
                              return <TimelineView />;
                            default:
                              return (
                                <div>
                                  <h2 className="workarea-section-title">
                                    Work Area
                                  </h2>
                                </div>
                              );
                          }
                        })()
                      : project && showSidebars
                        ? (() => {
                            return (
                              <section className="mx-auto w-full max-w-4xl bg-gw-chrome p-6 md:p-8">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                  <div>
                                    <p className="font-mono text-gw-nano uppercase tracking-label-wide text-gw-secondary">
                                      Work Area
                                    </p>
                                    <h2 className="mt-2 text-3xl font-semibold text-gw-primary">
                                      {project.name}
                                    </h2>
                                    <p className="mt-2 text-sm text-gw-secondary">
                                      Select a file from the resource tree, or
                                      create a new resource to continue.
                                    </p>
                                  </div>

                                  <Button
                                    variant="secondary"
                                    onClick={() =>
                                      setCreateModal({
                                        open: true,
                                        initialTitle: "",
                                        parentId: undefined,
                                      })
                                    }
                                  >
                                    <Plus size={14} aria-hidden="true" />
                                    Create Resource
                                  </Button>
                                </div>

                                <div className="mt-8">
                                  <div className="mb-3 flex items-center justify-between">
                                    <h3 className="font-mono text-gw-nano font-semibold uppercase tracking-[0.16em] text-gw-secondary">
                                      Recent Files
                                    </h3>
                                    <span className="text-xs text-gw-secondary">
                                      {recentResources.length} shown
                                    </span>
                                  </div>

                                  {recentResources.length > 0 ? (
                                    <ul className="divide-y divide-gw-border rounded-lg border-hairline border-gw-border bg-gw-chrome">
                                      {recentResources.map((resource) => {
                                        const icon =
                                          resource.type === "image"
                                            ? ImageIcon
                                            : resource.type === "audio"
                                              ? Music2
                                              : FileText;

                                        const Icon = icon;

                                        return (
                                          <li key={resource.id}>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                onResourceSelect?.(resource.id)
                                              }
                                              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gw-chrome2"
                                            >
                                              <span className="flex min-w-0 items-center gap-3">
                                                <Icon
                                                  size={16}
                                                  className="shrink-0 text-gw-secondary"
                                                  aria-hidden="true"
                                                />
                                                <span className="min-w-0">
                                                  <span className="block truncate text-sm font-medium text-gw-primary">
                                                    {resource.name}
                                                  </span>
                                                  <span className="block text-xs text-gw-secondary">
                                                    {resource.type}
                                                  </span>
                                                </span>
                                              </span>
                                              <span className="text-xs text-gw-secondary">
                                                {resource.updatedAt
                                                  ? `Edited ${formatRelativeTimestamp(resource.updatedAt)}`
                                                  : `Created ${formatRelativeTimestamp(resource.createdAt)}`}
                                              </span>
                                            </button>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  ) : (
                                    <div className="rounded-lg border border-dashed border-gw-border bg-gw-chrome px-4 py-6 text-sm text-gw-secondary">
                                      No files yet. Use{" "}
                                      <span className="font-medium text-gw-primary">
                                        Create Resource
                                      </span>{" "}
                                      to add your first text, image, or audio
                                      item.
                                    </div>
                                  )}
                                </div>
                              </section>
                            );
                          })()
                        : (children ?? (
                            <div>
                              <h2 className="workarea-section-title">
                                Work Area
                              </h2>
                              <p className="mt-2 text-sm text-gw-secondary">
                                Placeholder editor and views go here.
                              </p>
                            </div>
                          ))}
                  </div>
                </div>
              </div>
            </main>

            {/* Right Resize Handle */}
            {showSidebars && layout.rightOpen ? (
              <div
                role="separator"
                aria-orientation="vertical"
                onMouseDown={layout.startRightResize}
                className="hidden lg:block appshell-resize-handle"
              />
            ) : null}

            {/* Right Sidebar */}
            {showSidebars && layout.rightOpen ? (
              <aside
                className="hidden lg:flex appshell-sidebar border-l"
                style={{ width: layout.rightWidth }}
              >
                <div className="appshell-sidebar-header">
                  <span className="font-mono text-gw-nano uppercase tracking-label-wide font-semibold text-gw-secondary">
                    Metadata
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => layout.setRightOpen(false)}
                    title="Close right sidebar"
                    aria-label="Close metadata sidebar"
                  >
                    <PanelRightClose size={16} aria-hidden="true" />
                  </Button>
                </div>
                <div className="appshell-sidebar-content">
                  <MetadataSidebar
                    onChangeField={(key, value) => {
                      if (!selectedResource) return;
                      const id = selectedResource.id;
                      switch (key) {
                        case "synopsis":
                          onChangeSynopsis?.(value as string, id);
                          break;
                        case "notes":
                          onChangeNotes?.(value as string, id);
                          break;
                        case "status":
                          onChangeStatus?.(
                            value as "draft" | "in-review" | "published",
                            id,
                          );
                          break;
                        case "pov":
                          onChangePOV?.(value as ResourceRef, id);
                          break;
                        case "storyDate":
                          onChangeStoryDate?.(value as string, id);
                          break;
                        case "storyDuration":
                          onChangeStoryDuration?.(value as number | null, id);
                          break;
                        case "storyEndDate":
                          onChangeStoryEndDate?.(value as string | null, id);
                          break;
                        default:
                          onChangeDynamicMetadata?.(
                            { [key]: value as string[] },
                            id,
                          );
                          break;
                      }
                    }}
                  />
                </div>
              </aside>
            ) : null}

            {/* Right Sidebar Collapsed Toggle */}
            {showSidebars && !layout.rightOpen ? (
              <div className="hidden lg:flex flex-col items-center justify-start h-full p-2 bg-gw-chrome border-l border-hairline border-gw-border">
                <Button
                  variant="icon"
                  className="w-10 h-10"
                  onClick={() => layout.setRightOpen(true)}
                  title="Open right sidebar"
                  aria-label="Open metadata sidebar"
                >
                  <PanelRightOpen size={16} aria-hidden="true" />
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </ShellLayoutController>
    </div>
  );
}
