/**
 * Asks the app shell to open the one App Settings dialog (Feature 96, spec
 * FR-24). The dialog's open state lives in `AppShell`; components deeper in
 * the tree, such as the editor footer, raise this window event instead of
 * receiving a callback through every layer. Same channel style as the
 * spelling switch (`spellcheck-preference.ts`). No dialog is created here.
 */
export const OPEN_APP_SETTINGS_EVENT = "getwrite:open-app-settings";

export function requestOpenAppSettings(): void {
  window.dispatchEvent(new Event(OPEN_APP_SETTINGS_EVENT));
}
