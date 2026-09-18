"use client";
import { useState, type FormEvent } from "react";

import { ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { LanguageSwitcher, useLanguage } from "./i18n";
export function LoginForm({
  accessUnavailable,
}: {
  accessUnavailable: boolean;
}) {
  useLanguage();
  const [error, setError] = useState(
    accessUnavailable
      ? "Access is unavailable. Ask the workspace owner to check your account approval, or sign in again."
      : "",
  );
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: String(form.get("email")).trim(),
        password: String(form.get("password")),
      });
      if (error)
        setError("Unable to sign in. Check your details and try again.");
      else {
        try {
          await apiFetch("/api/v1/me");
          window.location.assign("/dashboard");
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : "Unable to verify access.",
          );
          await supabase.auth.signOut({ scope: "local" });
        }
      }
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-language-switcher">
        <LanguageSwitcher />
      </div>
      <section className="login-form-area">
        <div className="login-form">
          <h1>Health tracker</h1>
          <h2>Sign in</h2>

          {!supabase && (
            <div className="setup-notice">
              Sign-in is not configured yet. Follow the project README to
              connect your private workspace.
            </div>
          )}
          <form onSubmit={submit}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              required
              disabled={!supabase || busy}
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={!supabase || busy}
            />
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button
              className="button"
              disabled={!supabase || busy}
              type="submit"
            >
              {busy ? "Signing in…" : "Sign in"}
              <ArrowRight size={18} />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
