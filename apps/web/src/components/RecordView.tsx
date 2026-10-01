"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RecordDocument, RecordType } from "@bhumi/core";
import type { Snapshot } from "@/lib/snapshots";

const LABELS: Record<string, { en: string; mr: string }> = {
  "7/12": { en: "7/12 Extract", mr: "सातबारा" },
  "8A": {
    en: "8A Extract",
    mr: "गाव नमुना ८अ",
  },
  PropertyCard: {
    en: "Property Card",
    mr: "मिळकत पत्रिका",
  },
  KJP: {
    en: "Kami Jasti Patrak",
    mr: "कमी जास्त पत्रक",
  },
};

/**
 * A record ready to be displayed, from whichever source.
 *
 * A live fetch and a stored snapshot are the same document in different
 * wrappers — base64 in a JSON response, or bytes in IndexedDB — so both are
 * normalised to this before rendering. That is what lets the offline copy and
 * the fresh one go through one renderer instead of two that drift.
 */
export type Viewable =
  | { recordType: RecordType; format: "image"; mimeType: string; blob: Blob }
  | { recordType: RecordType; format: "html"; html: string };

/** Decode an API response into something displayable. */
export function viewableFromDocument(doc: RecordDocument): Viewable {
  if (doc.format === "html") return { recordType: doc.recordType, format: "html", html: doc.html };
  const binary = atob(doc.imageBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return {
    recordType: doc.recordType,
    format: "image",
    // Pinned to `image/*` so a mislabelled document can never be served as
    // something scriptable from this origin.
    mimeType: doc.mimeType.startsWith("image/") ? doc.mimeType : "application/octet-stream",
    blob: new Blob([bytes], { type: doc.mimeType }),
  };
}

/** Read a stored snapshot back into something displayable. */
export async function viewableFromSnapshot(snap: Snapshot): Promise<Viewable> {
  return snap.format === "image"
    ? { recordType: snap.recordType, format: "image", mimeType: snap.mimeType, blob: snap.blob }
    : { recordType: snap.recordType, format: "html", html: await snap.blob.text() };
}

export function RecordView({
  doc,
  meta,
  actions,
  scrollIntoView = true,
}: {
  doc: Viewable;
  /** Extra line under the title — freshness, the date a snapshot was taken. */
  meta?: ReactNode;
  /** Extra buttons alongside Open / Copy link / Download. */
  actions?: ReactNode;
  scrollIntoView?: boolean;
}) {
  const { en: title, mr: native } = LABELS[doc.recordType] ?? {
    en: doc.recordType,
    mr: "",
  };
  const ref = useRef<HTMLElement>(null);

  // The record is the point of the page; on a phone it lands well below the
  // fold on the search screen, so bring it into view when it arrives.
  useEffect(() => {
    if (scrollIntoView) ref.current?.scrollIntoView({ block: "start" });
  }, [doc, scrollIntoView]);

  /**
   * One object URL for the life of the document, used for display, Open and
   * Download alike. Browsers block top-level navigation to `data:` URLs and
   * treat multi-megabyte data URIs as unreliable download hrefs, and holding
   * the bytes out of the DOM keeps a several-MB scan out of the markup.
   */
  const blob = useMemo(
    () =>
      doc.format === "image"
        ? doc.blob
        : new Blob([wrapHtml(doc.html, title)], { type: "text/html" }),
    [doc, title],
  );
  const url = useObjectUrl(blob);

  /**
   * The whole request lives in the URL, so the address bar already *is* the
   * link that reopens this document — there is nothing to assemble.
   */
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  function copyLink() {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  function download() {
    if (!url) return;
    const extension = doc.format === "image" ? (doc.mimeType.split("/")[1] ?? "jpg") : "html";
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.recordType.replace("/", "-")}.${extension}`;
    a.click();
  }

  return (
    <section className="record" ref={ref} aria-labelledby="record-title">
      <div className="record-bar">
        <div>
          <h2 id="record-title">{title}</h2>
          <p className="record-meta">
            {native && <span lang="mr">{native}</span>}
            {native && " · "}
            {describe(doc, blob)}
            {meta}
          </p>
        </div>
        <div className="record-actions">
          {actions}
          {/* Images only: a blob URL inherits this origin, so opening the
              portal's HTML as a top-level document would run its scripts here —
              which is exactly what the sandboxed iframe below prevents. */}
          {doc.format === "image" && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!url}
              onClick={() => url && window.open(url, "_blank")}
            >
              Open
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={copyLink}>
            {copied ? "Link copied" : "Copy link"}
          </button>
          <button type="button" className="btn btn-ghost" disabled={!url} onClick={download}>
            Download
          </button>
        </div>
      </div>
      <div className="record-frame">
        {doc.format === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          url && <img src={url} alt={title} />
        ) : (
          <iframe title={title} sandbox="" srcDoc={wrapHtml(doc.html, title)} />
        )}
      </div>
    </section>
  );
}

/** An object URL that lives exactly as long as the blob it points at. */
function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const created = URL.createObjectURL(blob);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [blob]);
  return url;
}

/** "JPEG, 214 KB" — enough to tell a real scan from an error page. */
function describe(doc: Viewable, blob: Blob): string {
  if (doc.format !== "image") return "HTML table";
  const format = doc.mimeType.split("/")[1]?.toUpperCase() ?? "Image";
  return `${format}, ${Math.round(blob.size / 1024)} KB`;
}

/** Wrap a bare HTML fragment in a minimal, printable document. */
function wrapHtml(fragment: string, title: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body{font-family:"Noto Sans Devanagari",system-ui,sans-serif;color:#1a1613;margin:16px;font-size:13px;line-height:1.45}
  table{border-collapse:collapse;width:100%}
  td,th{border:1px solid #c9c3bc;padding:5px 7px;vertical-align:top}
  th{background:#f4f1ed;font-weight:600;text-align:left}
  #background,#background1{display:none!important}
</style></head><body>${fragment}</body></html>`;
}
