import React, { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "react-hot-toast";
import { X, FolderPlus } from "lucide-react";
import type { Project as CanonicalProject } from "../../src/lib/models/types";
import {
  listProjectTypeEntries,
  projectTypeListNotice,
} from "../../src/lib/api/project-types";
import { createProject } from "../../src/lib/api/projects";
import Button from "../common/UI/Button/Button";
import { Dialog, DialogContent, DialogTitle } from "../common/UI/Dialog";
import Input from "../common/UI/Input/Input";
import Select from "../common/UI/Select/Select";

export interface CreateProjectPayload {
  name: string;
  projectType: string;
}

export interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  // onCreate receives the form payload and, when available, the persisted `Project` returned by the server
  onCreate: (
    payload: CreateProjectPayload,
    createdProject?: {
      project: CanonicalProject;
      folders: any[];
      resources: any[];
    },
  ) => void;
  defaultName?: string;
  defaultType?: CreateProjectPayload["projectType"];
}

interface FilterableProjectType {
  id: string;
  name: string;
  description?: string;
}

/** Types whose id, name or description contains `filter` (case-insensitive). */
function filterProjectTypes<T extends FilterableProjectType>(
  types: T[],
  filter: string,
): T[] {
  if (!filter) return types;
  const q = filter.toLowerCase();
  return types.filter(
    (t) =>
      t.id.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      (t.description || "").toLowerCase().includes(q),
  );
}

/**
 * Controlled modal that:
 * - validates non-empty name,
 * - focuses the name input on open,
 * - emits `onCreate(payload)` and closes on success.
 *
 * Note: uses `setTimeout` to focus reliably; replace with a focus-trap for T030 if needed.
 */
export default function CreateProjectModal({
  isOpen,
  onClose,
  onCreate,
  defaultName = "",
  defaultType = "novel",
}: CreateProjectModalProps): JSX.Element | null {
  const [name, setName] = useState<string>(defaultName);
  const [projectType, setProjectType] =
    useState<CreateProjectPayload["projectType"]>(defaultType);
  const [types, setTypes] = useState<
    | {
        id: string;
        name: string;
        description?: string;
        source: "built-in" | "saved";
        // client-side validation error for this template (friendly message)
        validationError?: string | null;
      }[]
    | null
  >(null);
  const [listNotice, setListNotice] = useState<string | null>(null);
  const [isLoadingTypes, setIsLoadingTypes] = useState(false);
  const [filter, setFilter] = useState<string>("");
  const [typesError, setTypesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);

  const loadTypes = useCallback(async () => {
    setIsLoadingTypes(true);
    setTypesError(null);
    setListNotice(null);
    try {
      const resolved = await listProjectTypeEntries();
      const list = resolved.entries.map((e) => e.spec);
      // Lightweight client-side validation to surface common template issues
      const processed = list.map((t, index) => {
        const source = resolved.entries[index].source;
        const id = t.id ?? "";
        const name = t.name ?? id ?? "Unnamed";
        const description = t.description;
        const errors: string[] = [];
        if (!id) errors.push("Template missing required field: id.");
        if (!Array.isArray(t.folders))
          errors.push("Template missing required field: folders.");
        else if (t.folders.length === 0)
          errors.push("Template must include at least one folder.");
        return {
          id,
          name,
          description,
          source,
          validationError: errors.length > 0 ? errors.join(" ") : null,
        };
      });
      setTypes(processed);
      setListNotice(projectTypeListNotice(resolved));
      if (!defaultType && list.length > 0) setProjectType(processed[0].id);
    } catch (err) {
      setTypes([]);
      const msg = err instanceof Error ? err.message : String(err);
      setTypesError(msg);
      try {
        toast.error(`Failed to load project types: ${msg}`);
      } catch (_) {
        // swallow if toast lib not available in some test environments
      }
    } finally {
      setIsLoadingTypes(false);
    }
  }, [defaultType]);

  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      setProjectType(defaultType);
      setError(null);
      void loadTypes();
    }
  }, [isOpen, defaultName, defaultType]);

  const visibleTypes = filterProjectTypes(types ?? [], filter);
  const hasNoFilterMatch =
    !!types && types.length > 0 && visibleTypes.length === 0;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (isCreating) return; // ignore duplicate submits while creating
    e?.preventDefault();
    if (hasNoFilterMatch) return; // the select shows no type to create from
    if (!name.trim()) {
      setError("Please enter a project name.");
      nameRef.current?.focus();
      return;
    }

    const payload: CreateProjectPayload = { name: name.trim(), projectType };

    setIsCreating(true);
    setError(null);
    try {
      const body = await createProject(payload.name, payload.projectType);
      onCreate(payload, {
        project: body.project as CanonicalProject,
        folders: body.folders,
        resources: body.resources,
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      try {
        toast.error(`Failed to create project: ${msg}`);
      } catch (_) {}
    } finally {
      setIsCreating(false);
    }
  };

  const selectedType = hasNoFilterMatch
    ? undefined
    : types?.find((t) => t.id === projectType);

  // The select can only show a visible option, so a filter that hides the
  // chosen type moves the choice to the first match; otherwise the select
  // would display one type while the form submitted another.
  const handleFilterChange = (next: string) => {
    setFilter(next);
    const matches = filterProjectTypes(types ?? [], next);
    if (matches.length > 0 && !matches.some((t) => t.id === projectType)) {
      setProjectType(matches[0].id);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        maxWidth="max-w-[480px]"
        className="p-6"
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          nameRef.current?.focus();
        }}
      >
        <form onSubmit={handleSubmit} aria-busy={isCreating}>
          <DialogTitle asChild>
            <h2 className="font-sans text-gw-h2 text-gw-primary mb-5">
              Create Project
            </h2>
          </DialogTitle>

          <label className="project-modal-field">
            <div className="project-modal-label">Name</div>
            <Input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              className="w-full mt-1"
              aria-required
              disabled={isCreating}
            />
          </label>

          <label className="project-modal-field">
            <div className="project-modal-label">Project Type</div>
            <div>
              <Input
                type="search"
                aria-label="Filter project types"
                placeholder="Search project types..."
                value={filter}
                onChange={(e) => handleFilterChange(e.target.value)}
                className="w-full mt-1 mb-2"
                disabled={isCreating || isLoadingTypes}
              />
              <Select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value as string)}
                className="w-full mt-1"
                disabled={
                  isCreating ||
                  isLoadingTypes ||
                  (Array.isArray(types) && types.length === 0)
                }
              >
                {isLoadingTypes ? (
                  <option>Loading...</option>
                ) : hasNoFilterMatch ? (
                  <option value="">No matching project types</option>
                ) : types && types.length > 0 ? (
                  visibleTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.source === "saved" ? " (Saved)" : ""}
                      {t.description ? ` — ${t.description}` : ""}
                    </option>
                  ))
                ) : (
                  <option value="">No project types available</option>
                )}
              </Select>
            </div>
            {types && types.length > 0 && (
              <div className="project-modal-hint">
                {hasNoFilterMatch
                  ? "No project types match the filter."
                  : selectedType?.description}
              </div>
            )}
            {/* Show validation error for selected template (friendly messages) */}
            {selectedType?.validationError && (
              <div className="project-modal-error">
                Template validation: {selectedType.validationError}
              </div>
            )}
            {listNotice && (
              <div role="status" className="project-modal-hint">
                {listNotice}
              </div>
            )}
            {typesError && (
              <div className="project-modal-error">
                Failed to load project types: {typesError}
                <button
                  type="button"
                  onClick={() => void loadTypes()}
                  className="ml-3 underline"
                >
                  Retry
                </button>
              </div>
            )}
          </label>

          {error ? <div className="project-modal-error">{error}</div> : null}

          <div className="project-modal-actions">
            <Button variant="secondary" onClick={onClose} disabled={isCreating}>
              <X size={14} aria-hidden="true" />
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={
                isCreating ||
                hasNoFilterMatch ||
                !!selectedType?.validationError
              }
            >
              <FolderPlus size={14} aria-hidden="true" />
              {isCreating ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
