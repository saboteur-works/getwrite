"use client";

/**
 * @module ModuleSwitchSection
 *
 * Project Settings section (the "Modules" tab) with one on/off switch per
 * module in the static manifest (Feature 103, FR-7, FR-31). A save goes
 * through the Task 8 client `setModuleEnabled`; on success the project's
 * stored `modules` map is replaced in the store so `useModuleEnabled`
 * readers update, and a `role="status"` message says so. A failed save shows
 * a `role="alert"` message and the switch keeps showing the writer's choice,
 * not a silent revert. A module with no `config.modules` entry shows
 * its default state (on for Sources, off for Claims, OQ-13, Feature 108).
 *
 * The module write is not paired-device limited (FR-13 inventory in
 * `specs/features/sources-module-seam/experiments.md`), so the switch is
 * never disabled for that reason.
 */
import React, { useRef, useState } from "react";
import { useAppDispatch } from "../../src/store/hooks";
import { setProjectModules } from "../../src/store/projectsSlice";
import { setModuleEnabled } from "../../src/lib/api/modules";
import { MODULE_MANIFEST } from "../../src/lib/models/modules/manifest";
import type { ModuleManifestEntry } from "../../src/lib/models/modules/registry";
import { useModuleEnabled } from "./useModuleEnabled";

interface ModuleSwitchRowProps {
  module: ModuleManifestEntry;
  projectId: string;
}

type SaveResult =
  | { kind: "saved"; enabled: boolean }
  | { kind: "failed"; enabled: boolean; message: string };

function ModuleSwitchRow({
  module,
  projectId,
}: ModuleSwitchRowProps): JSX.Element {
  const dispatch = useAppDispatch();
  const isStoredEnabled = useModuleEnabled(module.id);
  // The writer's latest choice; shown in preference to the stored value so a
  // failed save never silently reverts the control.
  const [isWriterChoiceOn, setIsWriterChoiceOn] = useState<boolean | undefined>(
    undefined,
  );
  const [result, setResult] = useState<SaveResult | null>(null);
  const latestRequest = useRef(0);
  const label = module.view?.label ?? module.id;
  const isChecked = isWriterChoiceOn ?? isStoredEnabled;
  const inputId = `module-switch-${module.id}`;

  async function handleChange(enabled: boolean): Promise<void> {
    const requestNumber = ++latestRequest.current;
    setIsWriterChoiceOn(enabled);
    setResult(null);
    try {
      const saved = await setModuleEnabled({
        projectId,
        moduleId: module.id,
        enabled,
      });
      dispatch(setProjectModules({ modules: saved.modules }));
      if (requestNumber === latestRequest.current) {
        setResult({ kind: "saved", enabled });
      }
    } catch (error) {
      if (requestNumber === latestRequest.current) {
        setResult({
          kind: "failed",
          enabled,
          message: error instanceof Error ? error.message : "Save failed.",
        });
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="inline-flex items-center gap-2">
        <input
          id={inputId}
          type="checkbox"
          checked={isChecked}
          onChange={(event) => void handleChange(event.target.checked)}
          className="h-4 w-4 rounded border-gw-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gw-primary"
        />
        <span className="text-sm font-medium text-gw-primary">
          Enable {label}
        </span>
      </label>
      {result?.kind === "failed" ? (
        <p role="alert" className="text-sm font-medium text-gw-primary">
          Could not turn {label} {result.enabled ? "on" : "off"}:{" "}
          {result.message} The switch shows your choice; it is not saved.
        </p>
      ) : null}
      <p role="status" className="text-sm text-gw-secondary">
        {result?.kind === "saved"
          ? `${label} is now ${result.enabled ? "on" : "off"}.`
          : ""}
      </p>
    </div>
  );
}

/**
 * Renders the module switches for the active project.
 *
 * @param projectId - Server-validated id of the active project, sent with
 *   each save.
 */
export default function ModuleSwitchSection({
  projectId,
}: {
  projectId: string;
}): JSX.Element {
  return (
    <section className="rounded-lg border-[0.5px] border-gw-border bg-gw-chrome p-5">
      <h2 className="text-sm font-semibold text-gw-primary">Modules</h2>
      <p className="mt-1 text-sm text-gw-secondary">
        Turn a module on or off for this project. Switching a module off hides
        its view and its editor controls; its data stays on disk and is there
        when you turn it back on.
      </p>
      <div className="mt-4 flex flex-col gap-4">
        {MODULE_MANIFEST.map((module) => (
          <ModuleSwitchRow
            key={module.id}
            module={module}
            projectId={projectId}
          />
        ))}
      </div>
    </section>
  );
}
