"use client";

import { useEffect } from "react";
import "@/lib/install";
import { startSync } from "@/lib/sync";

/**
 * What the app does on every page without drawing anything: keeps a signed-in
 * list in step with the account, and (by loading `install.ts`) catches the
 * browser's one-time offer to install, so the Saved screen can make it later.
 */
export function Background() {
  useEffect(startSync, []);
  return null;
}
