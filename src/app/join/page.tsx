"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { post } from "@/components/fetcher";
import { Alert, Button, Card, Field, inputCls } from "@/components/ui";

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ competitionId: string }>("/api/join", { roomCode: code, nickname });
      router.push(`/play/${res.competitionId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-md mx-auto">
      <h1 className="text-3xl font-bold">Join a sprint</h1>
      <p className="text-navy-soft mt-1">Type the room code from your host.</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Field label="Room code" htmlFor="code" hint="6 letters and numbers, like K7MPQ2">
          <input
            id="code"
            className={`${inputCls} text-2xl tracking-[0.3em] uppercase font-bold text-center`}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={8}
            required
            aria-invalid={Boolean(error)}
          />
        </Field>
        <Field label="Nickname" htmlFor="nick" hint="Use a nickname, not your full name. Only you and your host will see your results.">
          <input id="nick" className={inputCls} value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={24} required autoComplete="off" />
        </Field>
        {error && (
          <Alert tone="rose" role="alert" title="Couldn't join">
            {error}
          </Alert>
        )}
        <Button type="submit" className="w-full text-lg" disabled={busy || code.length < 4 || !nickname.trim()}>
          {busy ? "Joining…" : "Let's go"}
        </Button>
      </form>
    </Card>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}
