"use client";

import { useEffect, useRef } from "react";

export interface UseDismissableMenuOptions {
  isOpen: boolean;
  onClose: () => void;
}

export interface UseDismissableMenuReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Encapsulates the three standard menu-dismissal behaviors:
 * - Outside mousedown closes the menu.
 * - Escape key closes the menu.
 * - ArrowDown/ArrowUp rotate focus among [role="menuitem"] children.
 *
 * Attach `containerRef` to the menu container element. The hook owns the
 * ref; callers do not need to create one separately.
 */
export default function useDismissableMenu({
  isOpen,
  onClose,
}: UseDismissableMenuOptions): UseDismissableMenuReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    function onMouseDown(e: MouseEvent) {
      const root = containerRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) {
        onClose();
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      const root = containerRef.current;
      if (e.key === "Escape") {
        onClose();
        e.preventDefault();
        return;
      }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && root) {
        const items = Array.from(
          root.querySelectorAll<HTMLElement>('[role="menuitem"]'),
        );
        if (items.length === 0) return;
        const active = document.activeElement as HTMLElement | null;
        const idx = active ? items.indexOf(active) : -1;
        if (e.key === "ArrowDown") {
          const next = items[(idx + 1) % items.length];
          next?.focus();
        } else {
          const prev = items[(idx - 1 + items.length) % items.length];
          prev?.focus();
        }
        e.preventDefault();
      }
    }

    document.addEventListener("mousedown", onMouseDown, { capture: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, {
        capture: true,
      } as EventListenerOptions);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  return { containerRef };
}
