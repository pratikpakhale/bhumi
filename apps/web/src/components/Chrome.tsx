"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Mark } from "@/lib/brand";
import { useCollection } from "@/lib/collection";

/**
 * The bar every screen shares: the mark and name, which go home, and the three
 * places there are to go. The current one is marked for assistive tech and by
 * weight, never by colour alone.
 */
export function Masthead() {
  const path = usePathname();
  const saved = useCollection().length;
  const nav = [
    { href: "/", label: "Search", current: path === "/" || path === "/record" },
    { href: "/map", label: "Map", current: path === "/map" },
    { href: "/saved", label: "Saved", current: path === "/saved", count: saved },
  ];
  return (
    <header className="masthead">
      <Link className="brand" href="/" aria-label="Bhumi — home">
        <Mark />
        <span className="wordmark">Bhumi</span>
      </Link>
      <nav className="nav" aria-label="Main">
        {nav.map((item) => (
          <Link key={item.href} className="nav-link" href={item.href} aria-current={item.current ? "page" : undefined}>
            {item.label}
            {!!item.count && <span className="count">{item.count}</span>}
          </Link>
        ))}
      </nav>
    </header>
  );
}

/** What this is, whose data it is, and what it is not. On every page. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        Bhumi is an independent reader for public records from Mahabhulekh and Bhunaksha, Government of
        Maharashtra. It is not a government site. Records are for viewing only and are not valid for legal use.
      </p>
      <p>No accounts, no tracking. What you save stays on this device.</p>
    </footer>
  );
}

const subscribeOnline = (fn: () => void) => {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
};

/** Says so when the device loses its connection, and what still works. */
export function OfflineNotice() {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <p className="notice" role="status">
      You are offline. Saved records you have opened before still show their last copy.
    </p>
  );
}
