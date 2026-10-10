"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "../common/UI/Dialog";
import Button from "../common/UI/Button";
import Input from "../common/UI/Input/Input";
import {
  getGlobalNoiseWords,
  setGlobalNoiseWords,
} from "../../src/lib/api/global-noise-words";
import SharingSettings from "../Sharing/SharingSettings";
import { toastService } from "../../src/lib/toast-service";

export interface AppSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Standalone, top-level "App Settings" surface (FR-14).
 *
 * Distinct from `ProjectSettingsDialog.tsx`: this dialog is not scoped to any
 * project and is reachable with no login/account required — it must never
 * be gated on `isHostedAuthActive()` or an auth session. Today it manages
 * exactly one thing, the cross-project global noise-word list (FR-5), via
 * `getGlobalNoiseWords`/`setGlobalNoiseWords` (`lib/api/global-noise-words.ts`,
 * Task 11), which already resolve to the correct web/Electron/native-Android
 * backend with no sync/merge between them.
 *
 * "App Settings" is a working name (FR-14), not yet fully approved — its
 * copy deliberately avoids implying a user account exists (no "Account
 * Settings", "your account", or "sign in to manage").
 */
export default function AppSettingsDialog({
  isOpen,
  onClose,
}: AppSettingsDialogProps): JSX.Element {
  const [words, setWords] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [newWord, setNewWord] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const newWordRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoadError(null);
    setIsLoading(true);
    getGlobalNoiseWords()
      .then((loaded) => setWords(loaded))
      .catch(() => {
        setWords([]);
        setLoadError("Could not load the noise-word list.");
      })
      .finally(() => setIsLoading(false));
  }, [isOpen]);

  const persist = async (nextWords: string[]): Promise<void> => {
    setIsSaving(true);
    try {
      const persisted = await setGlobalNoiseWords(nextWords);
      setWords(persisted);
    } catch {
      toastService.error("Could not save the noise-word list.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdd = async (e?: React.FormEvent): Promise<void> => {
    e?.preventDefault();
    const trimmed = newWord.trim();
    if (!trimmed || isSaving) return;
    if (words.includes(trimmed)) {
      setNewWord("");
      newWordRef.current?.focus();
      return;
    }
    setNewWord("");
    await persist([...words, trimmed]);
    newWordRef.current?.focus();
  };

  const handleRemove = async (word: string): Promise<void> => {
    if (isSaving) return;
    await persist(words.filter((existing) => existing !== word));
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        maxWidth="max-w-[560px]"
        className="p-6"
        aria-describedby={undefined}
      >
        <DialogTitle asChild>
          <h2 className="font-sans text-gw-h2 text-gw-primary mb-2">
            App Settings
          </h2>
        </DialogTitle>
        <p className="text-sm text-gw-secondary mb-5">
          Settings here apply across every project on this device, not to a
          single project. No login is required.
        </p>

        <section className="flex flex-col gap-4">
          <header>
            <h3 className="text-sm font-semibold text-gw-primary">
              Global noise words
            </h3>
            <p className="mt-1 text-sm text-gw-secondary">
              Words or phrases flagged as noise in every project. You can
              exclude one from a specific project in that project&rsquo;s own
              Noise Words settings.
            </p>
          </header>

          {isLoading ? (
            <p className="text-sm text-gw-secondary">Loading…</p>
          ) : loadError ? (
            <p role="alert" className="text-sm text-gw-secondary">
              {loadError}
            </p>
          ) : words.length === 0 ? (
            <p className="text-sm text-gw-secondary">
              No noise words yet. Add one below.
            </p>
          ) : (
            <ul className="space-y-2">
              {words.map((word) => (
                <li
                  key={word}
                  className="flex items-center justify-between gap-2 rounded-md border-hairline border-gw-border bg-gw-chrome px-3 py-2"
                >
                  <span className="text-sm text-gw-primary">{word}</span>
                  <button
                    type="button"
                    aria-label={`Remove noise word ${word}`}
                    className="rounded-md border border-gw-border bg-transparent p-1.5 text-gw-secondary transition-colors duration-150 hover:bg-gw-chrome2 disabled:opacity-50"
                    disabled={isSaving}
                    onClick={() => void handleRemove(word)}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="flex items-center gap-3"
            onSubmit={(e) => void handleAdd(e)}
          >
            <Input
              ref={newWordRef}
              className="flex-1"
              placeholder="Add a noise word…"
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              aria-label="New noise word"
              disabled={isLoading || isSaving}
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={isLoading || isSaving || !newWord.trim()}
            >
              Add
            </Button>
          </form>
        </section>

        <SharingSettings />

        <div className="project-modal-actions mt-6">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
