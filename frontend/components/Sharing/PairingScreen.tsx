"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Button from "../common/UI/Button/Button";
import Input from "../common/UI/Input/Input";
import {
  NOT_PAIRED_EXPLANATION,
  PAIRING_CODE_LABEL,
  PAIRING_CODE_UNUSABLE,
  PAIRING_CODE_WRONG,
  PAIRING_HEADING,
  PAIRING_SUBMIT,
  PAIRING_SUBMITTING,
  PAIRING_UNREACHABLE,
} from "./sharing-copy";

/**
 * @module Sharing/PairingScreen
 *
 * The browser pairing screen for home-network sharing (Feature 75, FR-19 to
 * FR-21). Mounted at `app/pair/page.tsx`; served to an unpaired device, so it
 * shows nothing about any project and makes no request until submit.
 *
 * It posts `{ code }` to `/api/sharing/pair` and tells four outcomes apart:
 * `wrong` and `unusable` (the server's 400 answers about the code), and
 * everything else (network failure, non-JSON body, any other status such as a
 * server error), which says nothing about the code. On success it navigates
 * with `window.location.assign("/")`, as `Auth/AuthScreen` does, so the next
 * page load carries the new device cookie.
 *
 * No alert colour: errors are conveyed by text, `role="alert"` and focus.
 */

const PAIR_ENDPOINT = "/api/sharing/pair";

type Failure = "wrong" | "unusable" | "unreachable";

const FAILURE_MESSAGES: Record<Failure, string> = {
  wrong: PAIRING_CODE_WRONG,
  unusable: PAIRING_CODE_UNUSABLE,
  unreachable: PAIRING_UNREACHABLE,
};

export interface PairingScreenProps {
  /** Called after a successful pairing. Defaults to navigating to `/`. */
  onPaired?: () => void;
}

function goToApp(): void {
  window.location.assign("/");
}

/** Classify the server's reply; anything not understood is "unreachable". */
async function submitCode(code: string): Promise<"paired" | Failure> {
  let response: Response;
  try {
    response = await fetch(PAIR_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
  } catch {
    return "unreachable";
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return "unreachable";
  }
  if (typeof body !== "object" || body === null) return "unreachable";
  const { ok, reason } = body as Record<string, unknown>;
  if (response.status === 200 && ok === true) return "paired";
  if (response.status === 400 && ok === false) {
    if (reason === "wrong") return "wrong";
    if (reason === "unusable") return "unusable";
  }
  return "unreachable";
}

export default function PairingScreen({
  onPaired = goToApp,
}: PairingScreenProps): JSX.Element {
  const [code, setCode] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const inputId = useId();

  useEffect(() => {
    if (failure !== null) inputRef.current?.focus();
  }, [failure]);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setFailure(null);
    const outcome = await submitCode(code);
    setIsSubmitting(false);
    if (outcome === "paired") {
      onPaired();
      return;
    }
    setFailure(outcome);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gw-chrome1 px-4">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-gw-primary text-lg">{PAIRING_HEADING}</h1>
        <p className="text-gw-body text-gw-secondary">
          {NOT_PAIRED_EXPLANATION}
        </p>
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <label
            htmlFor={inputId}
            className="block text-gw-body text-gw-primary"
          >
            {PAIRING_CODE_LABEL}
          </label>
          <Input
            id={inputId}
            ref={inputRef}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-invalid={failure === "wrong" || failure === "unusable"}
            aria-describedby={failure === null ? undefined : errorId}
            className="w-full"
          />
          {failure !== null ? (
            <p
              id={errorId}
              role="alert"
              className="text-gw-body text-gw-primary"
            >
              {FAILURE_MESSAGES[failure]}
            </p>
          ) : null}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? PAIRING_SUBMITTING : PAIRING_SUBMIT}
          </Button>
        </form>
      </div>
    </main>
  );
}
