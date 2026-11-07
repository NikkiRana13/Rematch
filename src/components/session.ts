"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./fetcher";

export interface SessionInfo {
  mode: "supabase" | "local-demo" | "unconfigured";
  aiConfigured: boolean;
  host: { id: string; displayName: string; hostRole: "teacher" | "student" } | null;
  hostNotTeacher?: boolean;
  learner: { nickname: string } | null;
  demoHosts: { id: string; displayName: string; hostRole: string }[];
}

export function useSession() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setSession(await api<SessionInfo>("/api/auth/session"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);
  return { session, error, refresh };
}
