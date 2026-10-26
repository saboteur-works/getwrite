"use client";
import React, { useEffect, useRef } from "react";
import { Provider } from "react-redux";
import { startSpellAvailability } from "../lib/spelling/start-availability";
import { AppStore, makeStore } from "./store";

export default function ClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) {
    // Create the store instance the first time this renders
    storeRef.current = makeStore();
  }
  const store = storeRef.current;
  // Spell checker availability: the browser gate and the once-per-reason
  // toasts, once for the whole app (the store's owner, client-only).
  useEffect(() => startSpellAvailability(store, navigator.userAgent), [store]);
  return <Provider store={storeRef.current}>{children}</Provider>;
}
