"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/Brand";

/**
 * App gate sign-in. Credentials are checked server-side against
 * AUTH_USERNAME / AUTH_PASSWORD — nothing secret is shipped to the browser.
 */
export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  /**
   * Only allow same-origin relative paths from ?next=, so a crafted link
   * cannot bounce a signed-in user to an external site.
   */
  function destination(): string {
    const next = new URLSearchParams(window.location.search).get("next");
    if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
    return next;
  }

  async function signIn() {
    if (busy) return;
    setErr("");

    if (!username.trim() || !password) {
      setErr("Enter both your username and password.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      if (res.status === 429) {
        setErr("Too many attempts. Please wait a few minutes and try again.");
        return;
      }
      if (res.status === 503) {
        setErr("Sign-in is not configured on the server. Please contact IT.");
        return;
      }
      if (!res.ok) {
        setErr("Incorrect username or password.");
        setPassword("");
        return;
      }

      const dest = destination();
      router.replace(dest);
      router.refresh();
    } catch {
      setErr("Could not reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <Brand compact />

      <section
        className="screen card"
        style={{ maxWidth: 460, margin: "0 auto", width: "100%" }}
        aria-labelledby="h-login"
      >
        <h2 id="h-login">Sign in</h2>
        <p className="sub">Registration desk access. Sign in to open the desk.</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            signIn();
          }}
          noValidate
        >
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={err ? "bad" : ""}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              className={err ? "bad" : ""}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
            <div className="err" role="alert" aria-live="polite">
              {err}
            </div>
          </div>

          <div className="actions">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>
      </section>

      <div className="footbar foot">
        <div>Registration desk · Beyond the Skyline</div>
      </div>
    </main>
  );
}
