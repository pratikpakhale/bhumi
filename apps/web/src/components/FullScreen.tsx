"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * A scanned record, filling the screen.
 *
 * A 7/12 is a dense scan read on a phone, so the whole page is what people
 * want to see. Tapping it opens this, not a new tab: the browser's own full
 * screen where it allows one (Android, desktop), and a modal over the whole
 * viewport where it does not (iPhone), so it looks the same either way. It
 * opens fitted to the width; a tap toggles the scan's own size, and pinching
 * zooms as on any page. Back, Escape or the close button return to the record.
 */
export function FullScreen({
  src,
  alt,
  open,
  onClose,
}: {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [actual, setActual] = useState(false);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // Not every browser has it, and none promise it; the modal already
      // covers the screen, so a refusal changes nothing.
      el.requestFullscreen?.().catch(() => {});
    }
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    // Leaving the browser's full screen (Back, Escape, a swipe) closes the view too.
    const left = () => {
      if (!document.fullscreenElement && dialog.current?.open) onClose();
    };
    document.addEventListener("fullscreenchange", left);
    return () => document.removeEventListener("fullscreenchange", left);
  }, [onClose]);

  function close() {
    setActual(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    onClose();
  }

  return (
    <dialog ref={dialog} className="fullscreen" aria-label={alt} onClose={close} data-actual={actual || undefined}>
      <button type="button" className="btn btn-ghost fullscreen-close" onClick={close} aria-label="Close full screen">
        <X size={20} aria-hidden="true" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={() => setActual((on) => !on)}
        title={actual ? "Fit to screen" : "Actual size"}
      />
    </dialog>
  );
}
