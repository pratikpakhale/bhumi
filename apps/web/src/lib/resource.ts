"use client";

/**
 * A keyed async resource.
 *
 * The page's dropdowns are all the same shape: some inputs identify a thing,
 * and the thing is fetched when those inputs change. Modelling that as a
 * `Resource` rather than a `useState` + `useEffect` + a shared "busy" flag buys
 * three things:
 *
 *  - **Concurrency is expressible.** Every resource carries its own status, so
 *    four cascade levels can load at once and each dropdown reports its own
 *    spinner. A single shared busy slot could only ever describe one of them,
 *    and the effects raced to clear it.
 *  - **"Empty" is distinguishable from "not asked yet".** `idle` and
 *    `ready([])` are different states, so an empty result renders an empty
 *    message and an untouched field renders nothing.
 *  - **Deps stay honest.** The identity of the request is a string key, so the
 *    effect depends on exactly one value and needs no lint suppression.
 */

import { useEffect, useRef, useState } from "react";

export type Resource<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/**
 * Load `T` whenever `key` changes. A null key means "nothing to ask for yet"
 * and parks the resource in `idle`.
 *
 * `seed` is data the server already resolved for the *initial* key; when
 * present the resource starts `ready` and skips the first fetch entirely, which
 * is what lets a server-rendered page hydrate without a request waterfall. It
 * is consumed once — navigating away and back re-fetches (through the client
 * memo cache, so that is cheap).
 */
export function useResource<T>(key: string | null, load: () => Promise<T>, seed?: T): Resource<T> {
  const seeded = useRef(seed !== undefined && key !== null ? key : null);
  const [state, setState] = useState<Resource<T>>(
    seed !== undefined && key !== null ? { status: "ready", data: seed } : { status: "idle" },
  );

  // Held in a ref so callers can pass an inline closure without retriggering:
  // the key alone decides when to load.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (key === null) {
      setState({ status: "idle" });
      return;
    }
    if (seeded.current === key) {
      seeded.current = null; // consume the server's answer exactly once
      return;
    }
    let live = true;
    setState({ status: "loading" });
    loadRef
      .current()
      .then((data) => live && setState({ status: "ready", data }))
      .catch((e) => live && setState({ status: "error", message: message(e) }));
    return () => {
      live = false;
    };
  }, [key]);

  return state;
}

/** The data if it has arrived, otherwise `undefined`. */
export const dataOf = <T,>(r: Resource<T>): T | undefined =>
  r.status === "ready" ? r.data : undefined;

/** The first error across a set of resources, for a single alert slot. */
export function firstError(...resources: Resource<unknown>[]): string | null {
  for (const r of resources) if (r.status === "error") return r.message;
  return null;
}
