"use client";

import { collection, entryId, useIsSaved, type Draft } from "@/lib/collection";

/** Keep this subject, or drop it. Idempotent: the id comes from the subject. */
export function SaveControl({
  subject,
  className,
  label,
}: {
  subject: Draft;
  className?: string;
  /** What is being saved, for a list of these: "survey 10/3". */
  label?: string;
}) {
  const id = entryId(subject.place, subject.kind, subject.code);
  const saved = useIsSaved(id);

  return (
    <button
      type="button"
      className={className ?? "btn btn-ghost"}
      aria-pressed={saved}
      // A constant name, so the pressed state alone says whether it is saved.
      aria-label={label ? `Save ${label}` : "Save"}
      // The offline copy stays either way; it belongs to the record, not the list.
      onClick={() => (saved ? collection.forget(id) : collection.save(subject))}
    >
      {saved ? "Saved" : "Save"}
    </button>
  );
}
