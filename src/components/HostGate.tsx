"use client";

import { useState } from "react";
import { post } from "./fetcher";
import { useSession, type SessionInfo } from "./session";
import { Alert, Button, Card, Field, Spinner, inputCls } from "./ui";

/** Renders children only for a signed-in host; otherwise shows the sign-in options for the current mode. */
export function HostGate({ children }: { children: (host: NonNullable<SessionInfo["host"]>, session: SessionInfo) => React.ReactNode }) {
  const { session, error, refresh } = useSession();
  if (error) return <Alert tone="rose" role="alert" title="Couldn't check your sign-in">{error}</Alert>;
  if (!session) return <Spinner label="Checking sign-in" />;
  if (session.mode === "unconfigured")
    return <Alert tone="rose" role="alert" title="Not configured">Set Supabase environment variables to enable hosting. See the README.</Alert>;
  if (session.hostNotTeacher)
    return (
      <Card className="max-w-md mx-auto space-y-3">
        <h1 className="text-2xl font-bold">Hosting is for teachers</h1>
        <p className="text-navy-soft">This account isn&apos;t a teacher account, so it can&apos;t create or manage competitions. Students can join sprints with a room code instead.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => post("/api/auth/logout").then(refresh)}>Sign out</Button>
          <a className="font-semibold underline self-center" href="/join">
            Join a sprint
          </a>
        </div>
      </Card>
    );
  if (!session.host) return <SignIn session={session} onSignedIn={refresh} />;
  return <>{children(session.host, session)}</>;
}

function SignIn({ session, onSignedIn }: { session: SessionInfo; onSignedIn: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (session.mode === "local-demo") {
    return (
      <Card className="max-w-lg mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Host sign-in (local demo)</h1>
        <Alert tone="amber" title="Demo accounts only">
          These fictional accounts exist only in local demo mode. They are disabled whenever Supabase is configured.
        </Alert>
        <div className="grid gap-3">
          {session.demoHosts.map((h) => (
            <Button key={h.id} variant="secondary" disabled={busy} onClick={() => run(async () => { await post("/api/auth/demo", { hostId: h.id }); onSignedIn(); })}>
              Continue as {h.displayName}
            </Button>
          ))}
        </div>
        {error && <Alert tone="rose" role="alert">{error}</Alert>}
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-bold">{mode === "login" ? "Host sign-in" : "Create a host account"}</h1>
      <p className="text-sm text-navy-soft">Hosting is for teachers. You&apos;ll only see results for competitions you create.</p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            if (mode === "login") {
              await post("/api/auth/login", { email, password });
              onSignedIn();
            } else {
              const r = await post<{ needsEmailConfirmation: boolean }>("/api/auth/signup", { email, password, displayName });
              if (r.needsEmailConfirmation) setInfo("Check your email to confirm your account, then sign in.");
              else onSignedIn();
            }
          });
        }}
      >
        {mode === "signup" && (
          <>
            <Field label="Display name" htmlFor="dn">
              <input id="dn" className={inputCls} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </Field>
          </>
        )}
        <Field label="Email" htmlFor="em">
          <input id="em" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Field>
        <Field label="Password" htmlFor="pw">
          <input
            id="pw"
            type="password"
            className={inputCls}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </Field>
        {error && <Alert tone="rose" role="alert">{error}</Alert>}
        {info && <Alert tone="green" role="status">{info}</Alert>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>
      <button type="button" className="text-sm underline" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
        {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
      </button>
    </Card>
  );
}
