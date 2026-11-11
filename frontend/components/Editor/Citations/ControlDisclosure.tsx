"use client";

/**
 * @module ControlDisclosure
 *
 * A disclosure around one of the editor's module controls (Cite selection,
 * Mark as claim). The control starts collapsed as a button so the editor body
 * and the annotations panel keep the screen, most of all on a phone
 * (Feature 108 device run, D6). The same behaviour applies at every width.
 *
 * - The button carries `aria-expanded` and `aria-controls` (the form region).
 * - Opening moves focus to the first field in the form. Closing by the button,
 *   Escape, or after the form reports success returns focus to the button.
 * - A success message the form passes to `done` stays visible beside the
 *   button as a status line, because the form (and its own status line) is
 *   unmounted when it closes. No colour alone, no red.
 */
import React from "react";
import Button from "../../common/UI/Button/Button";

export interface ControlDisclosureProps {
  /** The button text, which names the control ("Cite selection"). */
  label: string;
  /**
   * Renders the form. `done(message)` closes the disclosure, returns focus to
   * the button and shows the message; call it only after a success.
   */
  renderForm: (done: (message: string) => void) => React.ReactNode;
}

const FIELD_SELECTOR =
  "input:not([disabled]), select:not([disabled]), textarea:not([disabled])";

export default function ControlDisclosure({
  label,
  renderForm,
}: ControlDisclosureProps): JSX.Element {
  const [isOpen, setIsOpen] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const regionRef = React.useRef<HTMLDivElement>(null);
  const regionId = `${React.useId()}-form`;

  // Focus goes into the form when it opens; the button is the only focus
  // target otherwise (set in `close`, after the form has unmounted).
  React.useEffect(() => {
    if (!isOpen) return;
    const first = regionRef.current?.querySelector<HTMLElement>(FIELD_SELECTOR);
    (first ?? regionRef.current)?.focus();
  }, [isOpen]);

  const close = React.useCallback((message: string): void => {
    setIsOpen(false);
    setNotice(message);
    buttonRef.current?.focus();
  }, []);

  return (
    <div className="shrink-0 border-t border-gw-border">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2">
        <Button
          ref={buttonRef}
          type="button"
          variant="secondary"
          size="sm"
          aria-expanded={isOpen}
          aria-controls={isOpen ? regionId : undefined}
          onClick={() => {
            if (isOpen) close("");
            else {
              setNotice("");
              setIsOpen(true);
            }
          }}
        >
          {label}
        </Button>
        <p role="status" className="text-gw-small text-gw-primary">
          {notice}
        </p>
      </div>
      {isOpen ? (
        <div
          id={regionId}
          ref={regionRef}
          tabIndex={-1}
          className="max-h-[50vh] overflow-y-auto"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close("");
            }
          }}
        >
          {renderForm(close)}
        </div>
      ) : null}
    </div>
  );
}
