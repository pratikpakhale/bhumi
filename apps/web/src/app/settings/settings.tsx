"use client";

import { useEffect, useState } from "react";
import { copyIndex, forgetAllCopies } from "@/lib/copies";
import { forgetAll as forgetRecents } from "@/lib/recents";
import { renewMobile, storedMobile } from "@/lib/record-request";
import { install, useInstallability } from "@/lib/install";
import { Masthead, OfflineNotice, SiteFooter } from "@/components/Chrome";

const size = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * This device: the app itself, and everything Bhumi keeps here besides the
 * saved list, each with a way to clear it. "It stays on your device" is only a
 * promise if the device's owner can see what that is and empty it.
 */
export function SettingsScreen() {
  const [offline, setOffline] = useState<{ keys: Set<string>; bytes: number } | null>(null);
  useEffect(() => {
    void copyIndex().then(setOffline);
  }, []);
  // undefined until read: the server cannot know, and "none" would be a guess.
  const [mobile, setMobile] = useState<string | null | undefined>(undefined);
  useEffect(() => setMobile(storedMobile()), []);
  const [recentsCleared, setRecentsCleared] = useState(false);
  const [copiesProblem, setCopiesProblem] = useState(false);

  return (
    <div className="shell">
      <Masthead />
      <main>
        <OfflineNotice />

        <div className="intro">
          <h1 className="intro-title">Settings</h1>
          <p className="lede">The app on this device, and what Bhumi keeps here.</p>
        </div>

        <section className="step" aria-labelledby="settings-app">
          <div className="step-head">
            <h2 className="step-title" id="settings-app">
              App
            </h2>
          </div>
          <ul className="device-list">
            <InstallItem />
          </ul>
        </section>

        <section className="step" aria-labelledby="settings-stored">
          <div className="step-head">
            <h2 className="step-title" id="settings-stored">
              Kept on this device
            </h2>
          </div>
          <ul className="device-list">
            <li className="device-item">
              <h3>Offline copies</h3>
              <p>
                {offline === null ? (
                  <span className="skeleton skeleton-text skeleton-wide" role="img" aria-label="Checking" />
                ) : copiesProblem ? (
                  "Could not clear the offline copies."
                ) : offline.keys.size === 0 ? (
                  "None yet. Every record you open is kept, so it opens again without signal."
                ) : (
                  `${plural(offline.keys.size, "record")}, ${size(offline.bytes)}. Each opens again without signal.`
                )}
              </p>
              {!!offline?.keys.size && (
                <div className="device-item-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label="Clear offline copies"
                    onClick={async () => {
                      try {
                        await forgetAllCopies();
                        setCopiesProblem(false);
                      } catch {
                        setCopiesProblem(true);
                      }
                      setOffline(await copyIndex());
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </li>
            <li className="device-item">
              <h3>Recent places</h3>
              <p>{recentsCleared ? "Cleared." : "Districts, talukas and villages you pick are offered first next time."}</p>
              {!recentsCleared && (
                <div className="device-item-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label="Clear recent places"
                    onClick={() => {
                      forgetRecents();
                      setRecentsCleared(true);
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </li>
          </ul>
        </section>

        <section className="step" aria-labelledby="settings-portal">
          <div className="step-head">
            <h2 className="step-title" id="settings-portal">
              Mahabhulekh
            </h2>
          </div>
          <ul className="device-list">
            <li className="device-item">
              <h3>Number sent to Mahabhulekh</h3>
              <p>
                {mobile === undefined ? (
                  <span className="skeleton skeleton-text" role="img" aria-label="Checking" />
                ) : mobile ? (
                  <>
                    <span className="mono">{mobile}</span>.
                  </>
                ) : (
                  "Made when you first open a record."
                )}{" "}
                The portal asks for a mobile number but never checks it, so this one is random.
              </p>
              {mobile && (
                <div className="device-item-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMobile(renewMobile())}>
                    New number
                  </button>
                </div>
              )}
            </li>
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

/** Installing Bhumi, in whatever form this browser allows. */
function InstallItem() {
  const installability = useInstallability();
  const text = {
    installed: "Installed. Bhumi opens from your home screen, even with no signal.",
    prompt: "Opens from your home screen like an app, even with no signal.",
    ios: "Tap Share, then Add to Home Screen. Bhumi then opens like an app, even with no signal.",
    none: "Use your browser’s menu to install it or add it to the home screen. It then opens like an app, even with no signal.",
  }[installability];
  return (
    <li className="device-item">
      <h3>{installability === "installed" ? "Bhumi app" : "Install Bhumi"}</h3>
      <p>{text}</p>
      {installability === "prompt" && (
        <div className="device-item-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void install()}>
            Install
          </button>
        </div>
      )}
    </li>
  );
}
