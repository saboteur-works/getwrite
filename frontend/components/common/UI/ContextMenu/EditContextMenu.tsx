"use client";

import * as React from "react";
import { Scissors, Copy, Clipboard } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "./ContextMenu";

type SavedSelection = {
  el: HTMLInputElement | HTMLTextAreaElement;
  start: number;
  end: number;
  readOnly: boolean;
};

async function pasteAtSelection(
  el: HTMLInputElement | HTMLTextAreaElement,
  start: number,
  end: number,
): Promise<void> {
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return;
  }
  if (!text) return;

  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  const next = el.value.slice(0, start) + text + el.value.slice(end);
  if (nativeSetter) {
    nativeSetter.call(el, next);
  } else {
    el.value = next;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  try {
    el.setSelectionRange(start + text.length, start + text.length);
  } catch {}
}

function captureSelection(target: EventTarget | null): SavedSelection | null {
  if (
    !(target instanceof HTMLInputElement) &&
    !(target instanceof HTMLTextAreaElement)
  ) {
    return null;
  }
  let start = 0;
  let end = 0;
  try {
    start = target.selectionStart ?? 0;
    end = target.selectionEnd ?? 0;
  } catch {
    // Some input types (e.g. number in Chrome) throw on selectionStart access.
  }
  return { el: target, start, end, readOnly: target.readOnly };
}

export default function EditContextMenu({
  children,
}: {
  children: React.ReactNode;
}) {
  const [saved, setSaved] = React.useState<SavedSelection | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    setSaved(captureSelection(e.target));
    e.stopPropagation();
  };

  const restore = () => {
    if (!saved) return;
    saved.el.focus();
    try {
      saved.el.setSelectionRange(saved.start, saved.end);
    } catch {
      // non-selectable input types
    }
  };

  const hasSelection = saved ? saved.end > saved.start : false;
  const isReadOnly = saved?.readOnly ?? false;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <span onContextMenu={handleContextMenu} style={{ display: "contents" }}>
          {children}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent className="resource-context-menu">
        <ContextMenuItem
          className="resource-context-menu-item"
          disabled={!hasSelection || isReadOnly}
          onSelect={() => {
            restore();
            document.execCommand("cut");
          }}
        >
          <Scissors size={14} className="resource-context-menu-item-icon" />
          Cut
        </ContextMenuItem>
        <ContextMenuItem
          className="resource-context-menu-item"
          disabled={!hasSelection}
          onSelect={() => {
            restore();
            document.execCommand("copy");
          }}
        >
          <Copy size={14} className="resource-context-menu-item-icon" />
          Copy
        </ContextMenuItem>
        <ContextMenuItem
          className="resource-context-menu-item"
          disabled={isReadOnly}
          onSelect={() => {
            if (!saved) return;
            saved.el.focus();
            void pasteAtSelection(saved.el, saved.start, saved.end);
          }}
        >
          <Clipboard size={14} className="resource-context-menu-item-icon" />
          Paste
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
