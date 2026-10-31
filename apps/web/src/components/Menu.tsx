"use client";

import { useId, useRef, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";

/**
 * A "More" button and the actions it holds.
 *
 * A native popover: a bottom sheet on a phone, where it is within a thumb's
 * reach, and a popover anchored to its button on a wider screen (see `.menu`
 * in globals.css). It exists so a row of actions can show the one or two
 * everybody needs and keep the rest one tap away, rather than wrapping six
 * look-alike buttons onto two lines.
 */
export function Menu({
  title,
  className = "btn btn-ghost",
  children,
}: {
  /** What the actions are for: the sheet's heading on a phone, and its name. */
  title: string;
  className?: string;
  /** The actions; `close` dismisses the menu after one has run. */
  children: (close: () => void) => ReactNode;
}) {
  const id = useId();
  const anchor = `--${id.replace(/\W/g, "")}`;
  const menu = useRef<HTMLDivElement>(null);
  const close = () => menu.current?.hidePopover();

  return (
    <>
      <button type="button" className={className} popoverTarget={id} style={{ anchorName: anchor }}>
        More
        <ChevronDown className="menu-chevron" size={14} aria-hidden="true" />
      </button>
      <div id={id} ref={menu} popover="auto" role="dialog" className="menu" style={{ positionAnchor: anchor }} aria-label={title}>
        <div className="menu-head">
          <span>{title}</span>
          <button type="button" className="btn btn-ghost menu-close" popoverTarget={id} popoverTargetAction="hide" aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children(close)}
      </div>
    </>
  );
}
