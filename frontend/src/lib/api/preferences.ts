import type { ColorMode } from "../user-preferences";

export async function saveProjectPreferences(
  projectPath: string,
  preferences: { colorMode?: ColorMode },
): Promise<void> {
  await fetch("/api/project/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectPath, preferences }),
  });
}

export async function saveRevisionSettings(
  projectPath: string,
  defaultRevisionName: string,
): Promise<{ defaultRevisionName?: string }> {
  const response = await fetch("/api/project/revision-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectPath, defaultRevisionName }),
  });
  const body = (await response.json().catch(() => null)) as {
    defaultRevisionName?: string;
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(body?.error ?? "Failed to save default revision name.");
  }
  return body ?? {};
}
