"use client";

/**
 * A keyed async resource.
 *
 * The page's dropdowns are all the same shape: some inputs identify a thing,
 * and the thing is fetched when those inputs change. Modelling that as a
 * `Resource` rather than a `useState` + `useEffect` + a shared "busy" flag buys
 * four things:
 *
 *  - **Concurrency is expressible.** Every resource carries its own status, so
 *    four cascade levels can load at once and each dropdown reports its own
 *    spinner.
 *  - **"Empty" is distinguishable from "not asked yet".** `idle` and
 *    `ready([])` are different states.
 *  - **No stale frame.** The state remembers which key it answers, so the
 *    render after a key changes already reads `loading` — never the previous
 *    key's data under the new key's name.
 *  - **Failures are recoverable in place.** `retry()` asks again for the same
 *    key, so an error is a button, not a reload.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { canRetry, errorMessage, peek } from "./client";

export type Resource<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string; retryable: boolean };

export type Loaded<T> = Resource<T> & { retry: () => void };

const IDLE = { status: "idle" } as const;
const LOADING = { status: "loading" } as const;

/**
 * Load `T` whenever `key` changes. A null key means "nothing to ask for yet"
 * and parks the resource in `idle`.
 *
 * `seed` is data the server already resolved for the *initial* key; when
 * present the resource starts `ready` and skips the first fetch entirely, which
 * is what lets a server-rendered page hydrate without a request waterfall.
 *
 * Keys share the namespace of the client's memo (`lib/client.ts`), so a key
 * whose answer has already arrived is `ready` on the very first render.
 */
export function useResource<T>(key: string | null, load: () => Promise<T>, seed?: T): Loaded<T> {
  const [state, setState] = useState<{ key: string | null; res: Resource<T> }>(() =>
    seed !== undefined && key !== null ? { key, res: { status: "ready", data: seed } } : { key: null, res: IDLE },
  );

  // Held in a ref so callers can pass an inline closure without retriggering:
  // the key alone decides when to load.
  const loadRef = useRef(load);
  loadRef.current = load;

  // Anything but an answer for this key means there is something to load;
  // `retry()` works by putting the state back to `loading`.
  const settled = state.key === key && state.res.status !== "loading";

  useEffect(() => {
    if (key === null || settled) return;
    let live = true;
    const known = peek<T>(key);
    if (known !== undefined) {
      setState({ key, res: { status: "ready", data: known } });
      return;
    }
    loadRef
      .current()
      .then((data) => live && setState({ key, res: { status: "ready", data } }))
      .catch(
        (e: unknown) =>
          live && setState({ key, res: { status: "error", message: errorMessage(e), retryable: canRetry(e) } }),
      );
    return () => {
      live = false;
    };
  }, [key, settled]);

  const retry = useCallback(() => setState((s) => ({ key: s.key, res: LOADING })), []);

  let res: Resource<T>;
  if (key === null) res = IDLE;
  else if (state.key === key) res = state.res;
  else {
    const known = peek<T>(key);
    res = known !== undefined ? { status: "ready", data: known } : LOADING;
  }
  return { ...res, retry };
}

/** The data if it has arrived, otherwise `undefined`. */
export const dataOf = <T,>(r: Resource<T>): T | undefined =>
  r.status === "ready" ? r.data : undefined;

/** The first failed resource, for a single alert slot with one retry. */
export function firstFailure(...resources: Loaded<unknown>[]): Loaded<unknown> & { status: "error" } | null {
  for (const r of resources) if (r.status === "error") return r;
  return null;
}
