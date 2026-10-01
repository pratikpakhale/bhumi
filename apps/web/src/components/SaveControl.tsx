"use client";

import { collection, entryId, useIsSaved, type Draft } from "@/lib/collection";

/** Keep this subject, or drop it. Idempotent: the id comes from the subject. */
export function SaveControl({ subject, className }: { subject: Draft; className?: string }) {
  const id = entryId(subject.place, subject.kind, subject.code);
  const saved = useIsSaved(id);

  return (
    <button
      type="button"
      className={className ?? "btn btn-ghost"}
      aria-pressed={saved}
      // The history stays either way — dropping a subject from the list must not
      // silently discard the one thing that cannot be fetched again.
      onClick={() => (saved ? collection.forget(id) : collection.save(subject))}
    >
      {saved ? "Saved" : "Save"}
    </button>
  );
}
