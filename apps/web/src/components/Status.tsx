"use client";

import { useEffect, useState } from "react";

/**
 * Waiting, said plainly.
 *
 * The portal is slow and its slowness varies, so a loader that only spins
 * leaves a stranger wondering whether anything is happening. This one names
 * what it is waiting for and, as the wait stretches, says that the wait is
 * normal — then that it is unusually long. `stages` are `[afterSeconds, text]`.
 */
export function Loading({
  label,
  stages = [],
  size = "md",
}: {
  label: string;
  stages?: [number, string][];
  size?: "sm" | "md" | "lg";
}) {
  const seconds = useSeconds();
  const note = [...stages].reverse().find(([after]) => seconds >= after)?.[1];
  return (
    <div className={`loading loading-${size}`} role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="loading-text">
        <span>{label}</span>
        {note && <span className="loading-note">{note}</span>}
      </span>
    </div>
  );
}

/** Seconds since mount, ticking once a second. */
function useSeconds(): number {
  const [s, setS] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setS(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return s;
}

/** The portal's usual pace, for anything that waits on Mahabhulekh. */
export const PORTAL_STAGES: [number, string][] = [
  [6, "Mahabhulekh is slow; this usually takes 5–20 seconds."],
  [25, "Still waiting on Mahabhulekh. It is busier than usual."],
  [50, "This is taking much longer than normal. You can keep waiting or try again later."],
];

/** A failure, with the one thing to do about it. */
export function Failure({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert" role="alert">
      <p className="alert-text">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Rows standing in for a list that is on its way. */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-rows" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton skeleton-row" />
      ))}
    </div>
  );
}
