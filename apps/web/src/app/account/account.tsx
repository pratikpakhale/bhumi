"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useCollection } from "@/lib/collection";
import { signOut, sync, useAccount, type AccountState } from "@/lib/sync";
import { useHydrated } from "@/lib/hydrated";
import { AuthForm } from "@/components/Account";
import { Masthead, OfflineNotice, SiteFooter } from "@/components/Chrome";
import { Failure } from "@/components/Status";

/**
 * The account, on a screen of its own.
 *
 * An account does one thing, keep the saved list the same on every device, so
 * this screen is that one thing: the form while signed out, and while signed
 * in, the way out. Syncing is silent; it only speaks up when it fails.
 * Everything about this device lives in Settings instead.
 */
export function AccountScreen({ available }: { available: boolean }) {
  const hydrated = useHydrated();
  const account = useAccount();
  const entries = useCollection();
  const [note, setNote] = useState<string | null>(null);
  const formTitle = useId();

  return (
    <div className="shell">
      <Masthead />
      <main>
        <OfflineNotice />

        <div className="intro">
          <h1 className="intro-title">Account</h1>
          <p className="lede">
            {account.username ? (
              <>
                Signed in as <span className="mono">{account.username}</span>.
              </>
            ) : (
              "Sign in, and your saved records stay the same on every phone and computer you use."
            )}
          </p>
        </div>

        {!available ? (
          <section className="step">
            <p className="help help-top">Accounts are not set up on this server. Saved records still work on this device.</p>
          </section>
        ) : !hydrated ? (
          <section className="step" aria-hidden="true">
            <span className="skeleton skeleton-text skeleton-wide" />
          </section>
        ) : account.username ? (
          <SignedIn account={account} onSignOut={() => setNote("Signed out. Your saved records stay on this phone.")} />
        ) : (
          <section className="step" aria-labelledby={formTitle}>
            <h2 className="sr-only" id={formTitle}>
              Sign in or make an account
            </h2>
            {note && (
              <p className="help help-top" role="status">
                {note}
              </p>
            )}
            <AuthForm
              labelledBy={formTitle}
              // A phone with nothing saved is most likely a second phone; one
              // with a list is most likely about to make the account.
              initialMode={entries.length ? "sign-up" : "sign-in"}
              onDone={() => setNote(null)}
            />
            <p className="help">
              Only a username and a password: no email, no phone number. The account keeps your saved list, the names you
              gave and its order; each phone fetches the records themselves.
            </p>
          </section>
        )}

        <section className="step" aria-label="More">
          <Link className="link-row" href="/settings">
            <span className="link-row-text">
              Settings
              <span className="link-row-meta">Install the app, and what Bhumi keeps on this device</span>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function SignedIn({ account, onSignOut }: { account: AccountState; onSignOut: () => void }) {
  const [busy, setBusy] = useState(false);

  return (
    <section className="step" aria-label="Signed in">
      {account.status === "failed" && (
        <Failure message={`Could not sync. ${account.problem ?? ""}`.trim()} onRetry={() => void sync()} />
      )}
      <div className="step-actions">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          aria-busy={busy}
          onClick={async () => {
            setBusy(true);
            await signOut();
            setBusy(false);
            onSignOut();
          }}
        >
          {busy && <span className="spinner" aria-hidden="true" />}
          Sign out
        </button>
      </div>
    </section>
  );
}
