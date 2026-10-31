"use client";

/**
 * Whether Bhumi can be installed on this device, and how.
 *
 * Chrome, Edge and Samsung Internet offer installation through an event that
 * fires once, early, and can be replayed later from a button; it is kept here
 * from the first page so the Saved screen can offer it whenever it is opened.
 * The browser's own banner is left to show as well: it is how most people
 * find out an app exists. Safari has no such event, only Share → Add to Home
 * Screen, so on an iPhone or iPad the offer is those steps, in words.
 */

import { useSyncExternalStore } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Already an app; a button that installs it; Safari's steps; or nothing to offer. */
type Installability = "installed" | "prompt" | "ios" | "none";

let offer: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());

const standalone = () =>
  matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

const apple = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function current(): Installability {
  if (installed || standalone()) return "installed";
  if (offer) return "prompt";
  return apple() ? "ios" : "none";
}

// The offer can come before React has rendered anything, so listening starts
// as soon as this module loads in the browser.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    offer = e as InstallPromptEvent;
    changed();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    offer = null;
    changed();
  });
}

export function useInstallability(): Installability {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    current,
    () => "none",
  );
}

/** Show the browser's install dialog. True if the person went ahead. */
export async function install(): Promise<boolean> {
  if (!offer) return false;
  const event = offer;
  await event.prompt();
  const { outcome } = await event.userChoice;
  // An offer can be used once; the browser makes a new one if it is declined.
  offer = null;
  if (outcome === "accepted") installed = true;
  changed();
  return outcome === "accepted";
}
