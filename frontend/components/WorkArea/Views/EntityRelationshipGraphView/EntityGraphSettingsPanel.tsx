"use client";

import * as React from "react";
import { Settings } from "lucide-react";
import Button from "../../../common/UI/Button";
import Checkbox from "../../../common/UI/Checkbox";
import Input from "../../../common/UI/Input";
import {
  getEntityGraphSettings,
  setEntityGraphSettings,
} from "../../../../src/lib/api/entity-graph-settings";
import {
  KNOWN_ENTITY_GRAPH_CONNECTION_TYPES,
  type EntityGraphConnectionType,
} from "../../../../src/lib/models/entity-graph-connection-types";

export interface EntityGraphSettingsPanelProps {
  /** Server-validated id of the active project (directory basename). */
  projectId: string;
  /** Optional className for the outer wrapper. */
  className?: string;
}

/**
 * Human-readable labels for the five known connection-type keys (Feature 68,
 * Task 10). Exact copy is this implementation's judgment call, not yet
 * user-confirmed, mirroring Features 60-62's own working-copy precedent.
 */
const CONNECTION_TYPE_LABELS: Record<EntityGraphConnectionType, string> = {
  authored: "Authored relationships",
  cooccurrence: "Co-occurrence",
  backlinks: "Backlinks",
  proximityMentions: "Proximity mentions",
  sharedMetadata: "Shared tags/metadata",
};

const HOP_RADIUS_INVALID_MESSAGE = "Enter a whole number, 0 or greater.";

/**
 * Parses the hop-radius draft into a non-negative integer, or `undefined` for
 * anything else (mirroring `WordCountGoalField`'s `parseGoal`, minus the
 * empty-means-unset case — a hop radius has no "no value" state).
 */
function parseHopRadius(draft: string): number | undefined {
  const trimmed = draft.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : undefined;
}

/**
 * `EntityGraphSettingsPanel` is a disclosure button + panel (Feature 68, Task
 * 10, FR-7/FR-21) exposing the five entity-graph connection-type toggles plus
 * the focal-point hop-radius numeric field, reading and writing through Task
 * 6's `entity-graph-settings` transport. Each change persists immediately —
 * there is no separate "Save" action, mirroring a toggle-per-item control
 * rather than `WordCountGoalField`'s single-field save-button pattern — and
 * the local state is updated from the transport's own response on success, so
 * a later re-render always reflects what the server actually has, not an
 * optimistic guess.
 *
 * Reachable from the graph view itself (near `EntityGraphCanvas`'s existing
 * reset-view button, per OQ-3), not a Project Settings tab. This component
 * owns its own open/closed disclosure state; its parent only needs to render
 * it with a `projectId`.
 *
 * This component does not consume the settings to change what the graph
 * draws or how a focal point's hop radius is applied — that is Task 7 (edge
 * filtering) and Task 16 (hop-radius BFS/focal-point logic), both out of
 * scope here.
 */
export default function EntityGraphSettingsPanel({
  projectId,
  className = "",
}: EntityGraphSettingsPanelProps): JSX.Element {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [connectionTypes, setConnectionTypes] = React.useState<string[]>([]);
  const [hopRadiusDraft, setHopRadiusDraft] = React.useState<string>("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  const panelId = React.useId();

  const loadSettings = React.useCallback(async () => {
    try {
      const settings = await getEntityGraphSettings(projectId);
      setConnectionTypes(settings.entityGraphConnectionTypes);
      setHopRadiusDraft(String(settings.entityGraphFocalHopRadius));
      setErrorMessage(null);
      setIsLoaded(true);
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? `Failed to load graph settings: ${err.message}`
          : "Failed to load graph settings.",
      );
    }
  }, [projectId]);

  // Loads on first open only, not on every re-open, mirroring the lazy-load
  // precedent other on-demand panels/dialogs in this codebase use (e.g.
  // `ProseDiagnosticsDetailDialog.tsx`'s on-demand read).
  React.useEffect(() => {
    if (isOpen && !isLoaded) {
      void loadSettings();
    }
  }, [isOpen, isLoaded, loadSettings]);

  const persist = React.useCallback(
    async (nextConnectionTypes: string[], nextHopRadius: number) => {
      setIsSaving(true);
      setStatusMessage(null);
      setErrorMessage(null);
      try {
        const saved = await setEntityGraphSettings(
          projectId,
          nextConnectionTypes,
          nextHopRadius,
        );
        // Reflect the transport's own response, not the optimistic local
        // value, in case the server filtered an unknown key (FR-2) or
        // otherwise normalized the input.
        setConnectionTypes(saved.entityGraphConnectionTypes);
        setHopRadiusDraft(String(saved.entityGraphFocalHopRadius));
        setStatusMessage("Graph settings saved.");
      } catch (err) {
        setErrorMessage(
          err instanceof Error && err.message
            ? `Failed to save graph settings: ${err.message}`
            : "Failed to save graph settings.",
        );
      } finally {
        setIsSaving(false);
      }
    },
    [projectId],
  );

  const handleToggleConnectionType = (
    connectionType: EntityGraphConnectionType,
    checked: boolean,
  ): void => {
    const parsedHopRadius = parseHopRadius(hopRadiusDraft);
    if (parsedHopRadius === undefined) {
      setErrorMessage(HOP_RADIUS_INVALID_MESSAGE);
      return;
    }
    const next = checked
      ? [...connectionTypes, connectionType]
      : connectionTypes.filter((type) => type !== connectionType);
    setConnectionTypes(next);
    void persist(next, parsedHopRadius);
  };

  const handleHopRadiusChange = (value: string): void => {
    setHopRadiusDraft(value);
    const parsed = parseHopRadius(value);
    if (parsed === undefined) {
      setErrorMessage(HOP_RADIUS_INVALID_MESSAGE);
      return;
    }
    setErrorMessage(null);
    void persist(connectionTypes, parsed);
  };

  const isHopRadiusInvalid = errorMessage === HOP_RADIUS_INVALID_MESSAGE;

  return (
    <div
      className={`relative ${className}`}
      data-testid="entity-graph-settings-panel-wrapper"
    >
      <Button
        type="button"
        variant="icon"
        aria-label="Graph settings"
        title="Graph settings"
        aria-expanded={isOpen}
        aria-controls={panelId}
        data-testid="entity-graph-settings-toggle"
        onClick={() => setIsOpen((open) => !open)}
      >
        <Settings size={14} />
      </Button>
      {isOpen ? (
        <div
          id={panelId}
          role="group"
          aria-label="Entity graph settings"
          data-testid="entity-graph-settings-panel"
          className="absolute right-0 top-full z-10 mt-2 w-72 rounded border border-gw-border bg-gw-chrome p-4 shadow-lg"
        >
          <h3 className="mb-3 text-sm font-semibold text-gw-primary">
            Graph settings
          </h3>
          <fieldset
            className="mb-4 flex flex-col gap-2"
            disabled={!isLoaded || isSaving}
          >
            <legend className="mb-1 text-sm font-medium text-gw-primary">
              Connection types
            </legend>
            {KNOWN_ENTITY_GRAPH_CONNECTION_TYPES.map((connectionType) => {
              const inputId = `entity-graph-connection-type-${connectionType}`;
              return (
                <label
                  key={connectionType}
                  htmlFor={inputId}
                  className="flex items-center gap-2 text-sm text-gw-secondary"
                >
                  <Checkbox
                    id={inputId}
                    checked={connectionTypes.includes(connectionType)}
                    onChange={(event) =>
                      handleToggleConnectionType(
                        connectionType,
                        event.target.checked,
                      )
                    }
                  />
                  {CONNECTION_TYPE_LABELS[connectionType]}
                </label>
              );
            })}
          </fieldset>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="entity-graph-hop-radius"
              className="text-sm font-medium text-gw-primary"
            >
              Focal hop radius
            </label>
            <Input
              id="entity-graph-hop-radius"
              type="text"
              inputMode="numeric"
              value={hopRadiusDraft}
              onChange={(event) => handleHopRadiusChange(event.target.value)}
              disabled={!isLoaded || isSaving}
              aria-invalid={isHopRadiusInvalid}
              aria-describedby={
                isHopRadiusInvalid ? "entity-graph-hop-radius-error" : undefined
              }
              className="w-full"
            />
          </div>
          {errorMessage ? (
            <p
              id="entity-graph-hop-radius-error"
              role="alert"
              className="mt-2 text-sm font-medium text-gw-primary"
            >
              {errorMessage}
            </p>
          ) : null}
          <p role="status" className="mt-2 text-sm text-gw-secondary">
            {statusMessage}
          </p>
        </div>
      ) : null}
    </div>
  );
}
