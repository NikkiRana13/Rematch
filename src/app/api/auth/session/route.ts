import { connection } from "next/server";
import { handle } from "@/lib/api";
import { appMode } from "@/lib/env";
import { getHost } from "@/lib/auth/host";
import { getLearner } from "@/lib/auth/participant";
import { isAiConfigured } from "@/lib/analysis";
import { DEMO_HOSTS } from "@/lib/services/localSeed";

export async function GET() {
  await connection(); // always per-request: reads cookies and env
  return handle(async () => {
    const mode = appMode();
    if (mode === "unconfigured") return { mode, aiConfigured: false, host: null, learner: null, demoHosts: [] };
    const [host, learner] = await Promise.all([getHost(), getLearner()]);
    return {
      mode,
      aiConfigured: isAiConfigured(),
      host,
      learner: learner ? { nickname: learner.nickname } : null,
      demoHosts: mode === "local-demo" ? DEMO_HOSTS : [],
    };
  });
}
