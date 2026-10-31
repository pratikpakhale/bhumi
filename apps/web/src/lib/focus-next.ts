"use client";

import { useCallback, useEffect, useRef } from "react";

/** Only with a mouse or trackpad: on a touch screen focus raises the keyboard over what was just chosen. */
export function useFocusNext(): (id: string | null) => void {
  const next = useRef<string | null>(null);
  useEffect(() => {
    const id = next.current;
    if (!id) return;
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el || el.disabled) return;
    next.current = null;
    if (matchMedia("(pointer: fine)").matches) el.focus();
  });
  return useCallback((id) => {
    next.current = id;
  }, []);
}
