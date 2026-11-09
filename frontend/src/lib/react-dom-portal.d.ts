/**
 * Ambient declaration for the one `react-dom` export the app uses. The
 * workspace does not list `@types/react-dom`, and adding a dependency is out of
 * scope for Feature 105; replace this file with that package if it is added.
 */
declare module "react-dom" {
  import type { ReactNode } from "react";

  export function createPortal(
    children: ReactNode,
    container: Element | DocumentFragment,
    key?: string | null,
  ): ReactNode;
}
