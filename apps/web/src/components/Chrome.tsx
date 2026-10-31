"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useId, useSyncExternalStore } from "react";
import { CircleUserRound } from "lucide-react";
import { BRAND, Mark } from "@/lib/brand";
import { useCollection } from "@/lib/collection";
import { useAccount } from "@/lib/sync";
import { useHydrated } from "@/lib/hydrated";

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
      <div className="masthead-tools">
        <AccountLink current={path === "/account" || path === "/settings"} />
        <ThemeToggle />
      </div>
    </header>
  );
}

/**
 * The way to the account and settings, as the icon every app uses for "you".
 * Signed in, it says whose account it is to assistive tech; the icon itself
 * stays the same, so the bar does not change shape between visits.
 */
function AccountLink({ current }: { current: boolean }) {
  const { username } = useAccount();
  return (
    <Link
      className="icon-link"
      href="/account"
      aria-label={username ? `Account, signed in as ${username}` : "Account"}
      aria-current={current ? "page" : undefined}
    >
      <CircleUserRound size={22} strokeWidth={1.75} aria-hidden="true" />
    </Link>
  );
}

function ThemeToggle() {
  const { resolvedTheme, systemTheme, setTheme } = useTheme();
  const hydrated = useHydrated();
  const mask = `theme-${useId().replace(/\W/g, "")}`;
  const dark = resolvedTheme === "dark";

  useEffect(() => {
    if (!resolvedTheme) return;
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.setAttribute("content", dark ? BRAND.night : BRAND.paper);
    }
  }, [resolvedTheme, dark]);

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label="Dark theme"
      aria-pressed={hydrated ? dark : undefined}
      onClick={() => {
        const next = dark ? "light" : "dark";
        // Back to the device's own theme once the choice matches it, so a
        // phone that switches at sunset is followed again.
        setTheme(next === systemTheme ? "system" : next);
      }}
    >
      <svg className="theme-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <mask id={mask}>
          <rect width="24" height="24" fill="#fff" />
          <circle className="theme-bite" cx="27" cy="-3" r="6" fill="#000" />
        </mask>
        <g mask={`url(#${mask})`}>
          <circle className="theme-disc" cx="12" cy="12" r="5" fill="currentColor" />
        </g>
        <g className="theme-rays" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <line key={deg} x1="12" y1="2.5" x2="12" y2="4.5" transform={`rotate(${deg} 12 12)`} />
          ))}
        </g>
      </svg>
    </button>
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
      <p>No tracking. What you save stays on this device unless you sign in to sync it.</p>
      <p>
        <Link href="/settings">Settings</Link>
      </p>
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
