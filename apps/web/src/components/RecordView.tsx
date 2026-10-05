"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RecordDocument, RecordType } from "@bhumi/core";
import { documentBlob, type Copy } from "@/lib/copies";
import { shareLink } from "@/lib/share";

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
 * A live fetch and the copy kept on this device are the same document in different
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
  const blob = documentBlob(doc);
  return { recordType: doc.recordType, format: "image", mimeType: blob.type, blob };
}

/** Read the device's copy back into something displayable. */
export async function viewableFromCopy(copy: Copy): Promise<Viewable> {
  return copy.format === "image"
    ? { recordType: copy.recordType, format: "image", mimeType: copy.mimeType, blob: copy.blob }
    : { recordType: copy.recordType, format: "html", html: await copy.blob.text() };
}

export function RecordView({
  doc,
  subject,
  meta,
  actions,
}: {
  doc: Viewable;
  /** What the record is about — "Survey 167/2 बोरगांव" — for file names and sharing. */
  subject?: string;
  /** Appended to the line under the title — when this copy was fetched. */
  meta?: ReactNode;
  /** Extra buttons alongside Open / Share / Download. */
  actions?: ReactNode;
}) {
  const { en: title, mr: native } = LABELS[doc.recordType] ?? {
    en: doc.recordType,
    mr: "",
  };

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
   * link that reopens this document — there is nothing to assemble. On a phone
   * it goes to the share sheet, where WhatsApp is; elsewhere to the clipboard.
   */
  const [shared, setShared] = useState<string | null>(null);
  const sharedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(sharedTimer.current), []);

  async function share() {
    const how = await shareLink([title, subject].filter(Boolean).join(" — "), window.location.href);
    if (how === "shared") return;
    setShared(how === "copied" ? "Link copied" : "Could not copy");
    clearTimeout(sharedTimer.current);
    sharedTimer.current = setTimeout(() => setShared(null), 2500);
  }

  function download() {
    if (!url) return;
    const extension = doc.format === "image" ? (doc.mimeType.split("/")[1] ?? "jpg").replace("jpeg", "jpg") : "html";
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName([doc.recordType, subject])}.${extension}`;
    a.click();
  }

  return (
    <section className="record" aria-labelledby="record-title">
      <div className="record-bar">
        <div>
          <h2 id="record-title">{title}</h2>
          <p className="record-meta">
            {native && (
              <>
                <span lang="mr">{native}</span> ·{" "}
              </>
            )}
            {describe(doc, blob)}
            {meta && <> · {meta}</>}
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
          <button type="button" className="btn btn-ghost" onClick={() => void share()}>
            <span aria-live="polite">{shared ?? "Share"}</span>
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

/**
 * "7-12 Survey 167-2 बोरगांव" — readable in a downloads folder, and safe on
 * every file system: no slashes, no reserved characters.
 */
function fileName(parts: (string | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .replace(/[\\/:*?"<>|,]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Wrap a bare HTML fragment in a minimal, printable document. */
function wrapHtml(fragment: string, title: string): string {
  // The fragment is the portal's markup. The on-screen frame is sandboxed, but a
  // downloaded file opens unsandboxed, so the policy travels inside it.
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:">
<title>${escapeHtml(title)}</title>
<style>
  body{font-family:"Noto Sans Devanagari",system-ui,sans-serif;color:#1a1613;margin:16px;font-size:13px;line-height:1.45}
  table{border-collapse:collapse;width:100%}
  td,th{border:1px solid #c9c3bc;padding:5px 7px;vertical-align:top}
  th{background:#f4f1ed;font-weight:600;text-align:left}
  #background,#background1{display:none!important}
</style></head><body>${fragment}</body></html>`;
}
