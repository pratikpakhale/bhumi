"use client";

/**
 * Keeping the device's collection and the account's copy the same.
 *
 * Accounts are optional, and nothing here runs for someone who never signs in:
 * the device remembers that it is signed in (the cookie that proves it is
 * httpOnly, so script cannot see it), and without that note there is no
 * request, no listener and no change to how the collection behaves.
 *
 * The device stays the source every screen reads (see `collection.ts`); the
 * account is a second copy, merged with — never trusted over — the local one.
 * A sync is: read the account's copy, {@link combine} it with this device's,
 * keep the result here, and write it back only if it differs — conditional on
 * the version that was read, so a phone that syncs in between makes this one
 * merge again rather than be overwritten.
 *
 * It runs on start, shortly after every local change, and whenever the tab
 * comes back into view or back online — which is how one phone sees what
 * another added without any push channel.
 */

import { useSyncExternalStore } from "react";
import { api, ApiError, errorMessage } from "./client";
import { collection, combine, onCollectionChange, parseState, sameState } from "./collection";

/** This device's note of who is signed in. */
const KEY = "bhumi_account_v1";

export type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "failed";

export interface AccountState {
  /** Who is signed in on this device, or null. */
  username: string | null;
  status: SyncStatus;
  /** Why the last sync failed, when `status` is "failed". */
  problem: string | null;
}

/** Wait after a local change, so a burst of edits is one write. */
const SETTLE_MS = 1500;
/** Merges allowed against other devices' writes before giving up for now. */
const ATTEMPTS = 5;

const SIGNED_OUT: AccountState = { username: null, status: "idle", problem: null };

let state: AccountState | null = null;
const listeners = new Set<() => void>();

function read(): AccountState {
  if (state) return state;
  if (typeof window === "undefined") return SIGNED_OUT;
  let username: string | null = null;
  try {
    username = localStorage.getItem(KEY);
  } catch {}
  state = { ...SIGNED_OUT, username };
  return state;
}

function set(patch: Partial<AccountState>): void {
  state = { ...read(), ...patch };
  for (const fn of listeners) fn();
}

function remember(username: string | null): void {
  try {
    if (username) localStorage.setItem(KEY, username);
    else localStorage.removeItem(KEY);
  } catch {}
  set({ username, status: "idle", problem: null });
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  // Signing in or out in another tab is this tab's news too.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    state = null;
    fn();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAccount(): AccountState {
  return useSyncExternalStore(subscribe, read, () => SIGNED_OUT);
}

// ── Syncing ──────────────────────────────────────────────────────────────────

let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
/** Set while a merged copy is being kept, so keeping it is not itself a change to sync. */
let adopting = false;

async function syncOnce(): Promise<void> {
  let remote = await api.pullCollection();
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const theirs = parseState(remote.collection);
    const merged = combine(collection.snapshot(), theirs);
    adopting = true;
    try {
      collection.adopt(merged);
    } finally {
      adopting = false;
    }
    if (remote.collection !== null && sameState(merged, theirs)) return;
    const res = await api.pushCollection(merged, remote.etag);
    if (res.saved) return;
    remote = res;
  }
  throw new Error("Another device kept changing the list. It will sync again shortly.");
}

/** Sync now; a request while one runs queues exactly one more. */
export function sync(): Promise<void> {
  clearTimeout(timer);
  if (!read().username) return Promise.resolve();
  if (!navigator.onLine) {
    set({ status: "offline", problem: null });
    return Promise.resolve();
  }
  if (running) {
    again = true;
    return running;
  }
  set({ status: "syncing" });
  running = syncOnce()
    .then(
      () => set({ status: "synced", problem: null }),
      (e: unknown) => {
        // The session ended elsewhere: this device is signed out, its list kept.
        if (e instanceof ApiError && e.status === 401) remember(null);
        else if (!navigator.onLine) set({ status: "offline", problem: null });
        else set({ status: "failed", problem: errorMessage(e) });
      },
    )
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        void sync();
      }
    });
  return running;
}

function soon(): void {
  if (adopting || !read().username) return;
  clearTimeout(timer);
  timer = setTimeout(() => void sync(), SETTLE_MS);
}

let started = false;

/** Keep a signed-in device in step for the life of the page. Idempotent; inert when signed out. */
export function startSync(): void {
  if (started) return;
  started = true;
  onCollectionChange(soon);
  window.addEventListener("online", () => void sync());
  window.addEventListener("offline", () => read().username && set({ status: "offline", problem: null }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void sync();
  });
  void sync();
}

// ── Signing in and out ───────────────────────────────────────────────────────

/**
 * Sign in or create an account. What this device already holds is merged into
 * the account, so a list kept before signing up is not lost.
 */
export async function signIn(action: "sign-in" | "sign-up", username: string, password: string): Promise<void> {
  const res = await api.signIn(action, username, password);
  remember(res.username);
  await sync();
}

/**
 * Sign out. The list stays on this device exactly as it is — signing out stops
 * the syncing, it does not take anything away — and stays in the account too.
 * Never refused: a last sync and the server's sign-out are attempted, but an
 * offline phone can still stop syncing.
 */
export async function signOut(): Promise<void> {
  await sync();
  while (running) await running;
  await api.signOut().catch(() => {});
  remember(null);
}
