"use client";

import { useId, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { ApiError, errorMessage } from "@/lib/client";
import { normalizeUsername, passwordProblem, USERNAME, USERNAME_RULE } from "@/lib/account-rules";
import { signIn } from "@/lib/sync";
import { Segmented } from "@/components/Segmented";

type Mode = "sign-in" | "sign-up";

interface Problems {
  username?: string;
  password?: string;
  form?: string;
}

/**
 * Signing in and making an account, as one form: the two differ by a
 * password's rules and a button's words, so they are one choice at the top
 * rather than two screens. It asks for a username and a password and nothing
 * else, because nothing else is needed to tell one person's list from another's.
 */
export function AuthForm({
  labelledBy,
  initialMode,
  onDone,
}: {
  labelledBy: string;
  initialMode: Mode;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<Problems>({});
  const userRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const creating = mode === "sign-up";

  /** What is wrong before asking the server, in the words the server would use. */
  function check(): Problems {
    const name = normalizeUsername(username);
    if (!name) return { username: "Enter a username." };
    if (creating && !USERNAME.test(name)) return { username: USERNAME_RULE };
    if (!password) return { password: "Enter a password." };
    const problem = creating && passwordProblem(password);
    return problem ? { password: problem } : {};
  }

  async function submit() {
    const found = check();
    setProblems(found);
    if (found.username) return userRef.current?.focus();
    if (found.password) return passRef.current?.focus();
    setBusy(true);
    try {
      await signIn(mode, username, password);
      onDone();
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && e.status === 409) {
        setProblems({ username: e.message });
        userRef.current?.focus();
      } else {
        setProblems({ form: errorMessage(e) });
      }
    }
  }

  const help = (field: "username" | "password", hint?: string) => {
    const text = problems[field] ?? hint;
    return text ? (
      <p className="help" id={`${id}-${field}`} data-invalid={!!problems[field] || undefined}>
        {text}
      </p>
    ) : null;
  };
  const describedBy = (field: "username" | "password", hint?: string) =>
    problems[field] || hint ? `${id}-${field}` : undefined;

  const usernameHint = creating ? "Capitals do not matter. You will use it to sign in on other phones." : undefined;
  const passwordHint = creating ? "There is no way to reset it, so keep it somewhere safe." : undefined;

  return (
    <form
      className="auth"
      noValidate
      aria-labelledby={labelledBy}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Segmented
        items={[
          { key: "sign-in", label: "Sign in" },
          { key: "sign-up", label: "New account" },
        ]}
        value={mode}
        onChange={(next) => {
          setMode(next);
          setProblems({});
        }}
        labelledBy={labelledBy}
      />

      <div className="field">
        <label className="lbl" htmlFor={`${id}-u`}>
          Username
        </label>
        <input
          ref={userRef}
          id={`${id}-u`}
          className="inp"
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          maxLength={30}
          aria-invalid={!!problems.username || undefined}
          aria-describedby={describedBy("username", usernameHint)}
        />
        {help("username", usernameHint)}
      </div>

      <div className="field">
        <label className="lbl" htmlFor={`${id}-p`}>
          Password
        </label>
        <div className="inp-group">
          <input
            ref={passRef}
            id={`${id}-p`}
            className="inp"
            name="password"
            type={reveal ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={creating ? "new-password" : "current-password"}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-invalid={!!problems.password || undefined}
            aria-describedby={describedBy("password", passwordHint)}
          />
          <button
            type="button"
            className="btn btn-ghost"
            aria-pressed={reveal}
            aria-label="Show password"
            onClick={() => setReveal((on) => !on)}
          >
            {reveal ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            {reveal ? "Hide" : "Show"}
          </button>
        </div>
        {help("password", passwordHint)}
      </div>

      {problems.form && (
        <div className="alert" role="alert">
          <p className="alert-text">{problems.form}</p>
        </div>
      )}

      <div className="step-actions">
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {busy ? (creating ? "Making account…" : "Signing in…") : creating ? "Make account" : "Sign in"}
        </button>
      </div>
    </form>
  );
}
