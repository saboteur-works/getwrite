"use client";

import React, { createContext, useContext, useId, useRef } from "react";
import { cn } from "../utils";

type TabsOrientation = "horizontal" | "vertical";

interface TabsContextValue {
  activeValue: string;
  onValueChange: (value: string) => void;
  baseId: string;
  orientation: TabsOrientation;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs subcomponents must be used inside <Tabs>");
  return ctx;
}

export interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  /**
   * Layout of the tab list. "vertical" places the list as a left-hand rail
   * (with `aria-orientation="vertical"` and Up/Down arrow navigation).
   * Defaults to "horizontal".
   */
  orientation?: TabsOrientation;
  children: React.ReactNode;
}

export function Tabs({
  value,
  onValueChange,
  className,
  orientation = "horizontal",
  children,
}: TabsProps): JSX.Element {
  const baseId = useId();
  return (
    <TabsContext.Provider
      value={{ activeValue: value, onValueChange, baseId, orientation }}
    >
      <div
        className={cn(
          "tabs-root",
          orientation === "vertical" && "tabs-root--vertical",
          className,
        )}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export interface TabsListProps {
  className?: string;
  "aria-label"?: string;
  children: React.ReactNode;
}

export function TabsList({
  className,
  children,
  "aria-label": ariaLabel,
}: TabsListProps): JSX.Element {
  const { onValueChange, orientation } = useTabsContext();
  const listRef = useRef<HTMLDivElement>(null);
  const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
  const prevKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";

  function focusAndActivate(el: HTMLElement | undefined) {
    if (!el) return;
    el.focus();
    const value = el.dataset.value;
    if (value) onValueChange(value);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const list = listRef.current;
    if (!list) return;
    const tabs = Array.from(
      list.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])'),
    );
    const idx = tabs.indexOf(document.activeElement as HTMLElement);
    if (e.key === nextKey) {
      focusAndActivate(tabs[(idx + 1) % tabs.length]);
      e.preventDefault();
    } else if (e.key === prevKey) {
      focusAndActivate(tabs[(idx - 1 + tabs.length) % tabs.length]);
      e.preventDefault();
    } else if (e.key === "Home") {
      focusAndActivate(tabs[0]);
      e.preventDefault();
    } else if (e.key === "End") {
      focusAndActivate(tabs[tabs.length - 1]);
      e.preventDefault();
    }
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      className={cn(
        "tabs-list",
        orientation === "vertical" && "tabs-list--vertical",
        className,
      )}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

export interface TabsTriggerProps {
  value: string;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function TabsTrigger({
  value,
  disabled = false,
  className,
  children,
}: TabsTriggerProps): JSX.Element {
  const { activeValue, onValueChange, baseId } = useTabsContext();
  const isActive = activeValue === value;

  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-controls={`${baseId}-panel-${value}`}
      aria-selected={isActive}
      aria-disabled={disabled}
      data-value={value}
      disabled={disabled}
      tabIndex={isActive ? 0 : -1}
      className={cn(
        "tabs-trigger",
        isActive && "tabs-trigger--active",
        className,
      )}
      onClick={() => !disabled && onValueChange(value)}
    >
      {children}
    </button>
  );
}

export interface TabsContentProps {
  value: string;
  className?: string;
  children: React.ReactNode;
  /**
   * When true, keeps the panel mounted even while inactive, CSS-hiding it
   * (via the native `hidden` attribute) instead of unmounting it. Use this
   * to preserve in-progress state (e.g. unsaved form edits) across tab
   * switches. Defaults to false, which preserves the original
   * unmount-on-inactive behavior.
   */
  forceMount?: boolean;
}

export function TabsContent({
  value,
  className,
  children,
  forceMount = false,
}: TabsContentProps): JSX.Element | null {
  const { activeValue, baseId } = useTabsContext();
  const isActive = activeValue === value;

  if (!forceMount && !isActive) return null;

  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      className={cn("tabs-content", className)}
      hidden={forceMount && !isActive ? true : undefined}
    >
      {children}
    </div>
  );
}
